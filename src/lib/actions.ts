
'use server';

import { z } from 'zod';
import {
  prioritizeSupportTicket,
  type PrioritizeSupportTicketOutput,
} from '@/ai/flows/prioritize-support-ticket';
import {
  createSubdomain,
  type CreateSubdomainOutput,
} from '@/ai/flows/create-subdomain';
import { db } from './firebase';
import { ref, set, push, update, get, remove, query, orderByChild, equalTo } from 'firebase/database';
import type { Plan } from '@/app/admin/plans/page';
import { headers } from 'next/headers';
import { sendEmail } from './email';
import crypto from 'crypto';
import type { Advertisement } from '@/app/admin/advertisement/page';
import { revalidatePath } from 'next/cache';

// Support Ticket Action
const ticketSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  description: z.string().min(20, 'Description must be at least 20 characters'),
  userType: z.enum(['paying', 'non-paying']),
  userId: z.string().min(1, 'User ID is required'),
  userEmail: z.string().email(),
});

export type FormState = {
  message: string;
  fields?: Record<string, string>;
  isError: boolean;
  result?: PrioritizeSupportTicketOutput;
  ticketId?: string;
};

export async function handleTicketSubmission(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const validatedFields = ticketSchema.safeParse({
    title: formData.get('title'),
    description: formData.get('description'),
    userType: formData.get('userType'),
    userId: formData.get('userId'),
    userEmail: formData.get('userEmail'),
  });

  if (!validatedFields.success) {
    const fields: Record<string, string> = {};
    for (const key of Object.keys(validatedFields.error.flatten().fieldErrors)) {
        fields[key] = validatedFields.error.flatten().fieldErrors[key]!.join(', ');
    }
    return {
      message: "Validation failed. Please check your input.",
      fields,
      isError: true,
    };
  }

  try {
    const result = await prioritizeSupportTicket({
      ticketTitle: validatedFields.data.title,
      ticketDescription: validatedFields.data.description,
      userType: validatedFields.data.userType,
    });
    
    // Save the ticket to the database
    const ticketsRef = ref(db, 'tickets');
    const newTicketRef = push(ticketsRef);
    await set(newTicketRef, {
        userId: validatedFields.data.userId,
        userEmail: validatedFields.data.userEmail,
        ticketTitle: validatedFields.data.title,
        ticketDescription: validatedFields.data.description,
        priorityScore: result.priorityScore,
        reason: result.reason,
        status: 'Open',
        createdAt: new Date().toISOString(),
        replies: [],
    });
    
    revalidatePath('/dashboard/support/tickets');
    revalidatePath('/admin/tickets');

    return {
      message: 'Ticket submitted and prioritized successfully!',
      isError: false,
      result,
      ticketId: newTicketRef.key || undefined,
    };
  } catch (error) {
    console.log(error);
    return {
      message: 'An unexpected error occurred while prioritizing the ticket. Please try again later.',
      isError: true,
    };
  }
}

// Subdomain Creation Action
const subdomainSchema = z.object({
  subdomain: z
    .string()
    .min(3, 'Subdomain must be at least 3 characters long.')
    .max(30, 'Subdomain must be no more than 30 characters long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'),
  userId: z.string().min(1, 'User ID is required.'),
  serviceId: z.string().optional(),
});

export type SubdomainFormState = {
    message: string;
    fields?: Record<string, string>;
    isError: boolean;
    result?: CreateSubdomainOutput;
};

export async function handleSubdomainCreation(
    prevState: SubdomainFormState,
    formData: FormData
): Promise<SubdomainFormState> {
    const validatedFields = subdomainSchema.safeParse({
        subdomain: formData.get('subdomain'),
        userId: formData.get('userId'),
        serviceId: formData.get('serviceId'),
    });

    if (!validatedFields.success) {
        const fields: Record<string, string> = {};
        for (const key of Object.keys(validatedFields.error.flatten().fieldErrors)) {
            fields[key] = validatedFields.error.flatten().fieldErrors[key]!.join(', ');
        }
        return {
            message: "Validation failed. Please check the form.",
            fields,
            isError: true,
        };
    }
    
    const { userId, subdomain, serviceId } = validatedFields.data;

    try {
        // Fetch DNS settings to determine if we are in test mode
        const dnsSettingsRef = ref(db, 'settings/dns');
        const dnsSnapshot = await get(dnsSettingsRef);
        const isTestMode = dnsSnapshot.exists() ? dnsSnapshot.val().testModeEnabled : false;

        const result = await createSubdomain({ subdomain, isTest: isTestMode });

        if (result.success && result.subdomain) {
            // Subdomain created by AI, now save it and link to service
            const newSubdomainRef = push(ref(db, 'subdomains'));
            await set(newSubdomainRef, {
                userId,
                subdomain: result.subdomain,
                createdAt: new Date().toISOString(),
            });

            // If a serviceId is provided (from the manage service page), link it.
            if (serviceId) {
                const serviceToUpdateRef = ref(db, `users/${userId}/services/${serviceId}`);
                await update(serviceToUpdateRef, { subdomain: result.subdomain });
            }
        }
        
        return {
            message: result.message,
            isError: !result.success,
            result,
        };
    } catch (error) {
        console.error(error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred. Please try again later.';
        return {
            message: errorMessage,
            isError: true,
        };
    }
}


// Order Service Action
interface OrderServicePayload {
    plan: Plan;
    userId: string;
    paymentMethod: string;
}

export async function orderService({ plan, userId, paymentMethod }: OrderServicePayload) {
    if (!userId || !plan || !plan.id) {
        throw new Error("User ID and Plan are required to place an order.");
    }
    
    // Set status to Active for fake gateway, Pending for real gateways
    const status = paymentMethod === 'fake' ? 'Active' : 'Pending';

    // Remove the plan's own 'id' before saving it as a service
    const { id, ...planDetails } = plan;

    const serviceData = {
        ...planDetails,
        planId: id, // Keep track of the original plan
        orderDate: new Date().toISOString(),
        status: status,
    };

    const serviceRef = ref(db, `users/${userId}/services`);
    const newServiceRef = push(serviceRef);
    await set(newServiceRef, serviceData);
}

// User Status Action
export async function updateUserStatus(userId: string, status: 'Active' | 'Suspended') {
    if (!userId) {
        throw new Error("User ID is required.");
    }
    const userRef = ref(db, `users/${userId}`);
    await update(userRef, { status });
}

// Service Status Action
export async function updateServiceStatus(userId: string, serviceId: string, status: 'Active' | 'Suspended' | 'Terminated' | 'Banned' | 'Pending') {
    if (!userId || !serviceId) {
        throw new Error("User ID and Service ID are required.");
    }
    const serviceRef = ref(db, `users/${userId}/services/${serviceId}`);
    await update(serviceRef, { status });
}

// Domain Settings Action
const domainSettingsSchema = z.object({
  domain: z.string().min(1, "Domain name is required."),
});

export async function saveDomainSettings(data: z.infer<typeof domainSettingsSchema>) {
    const validatedData = domainSettingsSchema.parse(data);
    const settingsRef = ref(db, 'settings/domain');
    await set(settingsRef, validatedData);
}


// cPanel/DNS Settings Action
const dnsSettingsSchema = z.object({
  autoDnsEnabled: z.boolean(),
  host: z.string().optional(),
  port: z.coerce.number().optional(),
  username: z.string().optional(),
  apiToken: z.string().optional(),
  testModeEnabled: z.boolean(),
});

export async function saveDnsSettings(data: z.infer<typeof dnsSettingsSchema>) {
    const validatedData = dnsSettingsSchema.parse(data);
    
    const settingsRef = ref(db, 'settings/dns');
    await update(settingsRef, validatedData);
}

// Maintenance Settings Action
const maintenanceSettingsSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['full', 'partial']),
  fullMessage: z.string().optional(),
  partialMessage: z.string().optional(),
  serverOverloadEnabled: z.boolean(),
  serverOverloadMessage: z.string().optional(),
});

export async function saveMaintenanceSettings(data: z.infer<typeof maintenanceSettingsSchema>) {
    const validatedData = maintenanceSettingsSchema.parse(data);
    const settingsRef = ref(db, 'settings/maintenance');
    await set(settingsRef, validatedData);
}

// Security Settings Action
const securitySettingsSchema = z.object({
  multiLoginProtectionEnabled: z.boolean().optional(),
  antiVpnEnabled: z.boolean().optional(),
  ipinfoApiToken: z.string().optional(),
  appCheckEnabled: z.boolean().optional(),
  ddosProtectionLevel: z.enum(['normal', 'advanced', 'maximum']).optional(),
});

export async function saveSecuritySettings(data: z.infer<typeof securitySettingsSchema>) {
    const validatedData = securitySettingsSchema.parse(data);
    const settingsRef = ref(db, 'settings/security');
    await update(settingsRef, validatedData);
}


// Auth Logs Actions
interface LogAuthEventPayload {
  email: string;
  action: 'Login' | 'Register' | 'Verification';
}

export async function logAuthEvent({ email, action }: LogAuthEventPayload) {
  try {
    const ip = headers().get('x-forwarded-for') ?? 'IP not found';
    const logData = {
      email,
      action,
      ip,
      timestamp: new Date().toISOString(),
    };
    const logsRef = ref(db, 'auth_logs');
    const newLogRef = push(logsRef);
    await set(newLogRef, logData);
  } catch (error) {
    console.error("Failed to log auth event:", error);
    // We don't throw an error here to not interrupt the user flow
  }
}

export async function clearAuthLogs() {
    try {
        const logsRef = ref(db, 'auth_logs');
        await remove(logsRef);
    } catch (error) {
        console.error("Failed to clear auth logs:", error);
        throw new Error("Could not clear authentication logs from the database.");
    }
}

// Registration Action
const registrationSchema = z.object({
    email: z.string().email({ message: "Invalid email address." }),
    password: z.string().min(6, { message: "Password must be at least 6 characters." }),
    confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"], // path of error
});

export type RegistrationFormState = {
    message: string;
    errors?: Record<string, string>;
    isError: boolean;
    success?: boolean;
    pending?: boolean;
    requiresVerification?: boolean;
    email?: string;
};

export async function handleRegistration(
    prevState: RegistrationFormState,
    formData: FormData
): Promise<RegistrationFormState> {
    const validatedFields = registrationSchema.safeParse(Object.fromEntries(formData));
    
    if (!validatedFields.success) {
        const errors: Record<string, string> = {};
        for (const [key, value] of Object.entries(validatedFields.error.flatten().fieldErrors)) {
            errors[key] = value.join(', ');
        }
        return {
            message: "Validation failed.",
            errors,
            isError: true,
        };
    }
    
    const { email, password } = validatedFields.data;
    const ip = headers().get('x-forwarded-for') ?? '127.0.0.1'; // Fallback for local dev
    
    try {
        const securitySettingsRef = ref(db, 'settings/security');
        const securitySnapshot = await get(securitySettingsRef);
        const securitySettings = securitySnapshot.val() || {};

        if (securitySettings.multiLoginProtectionEnabled) {
            const logsRef = ref(db, 'auth_logs');
            const ipLogsSnapshot = await get(query(logsRef, orderByChild('ip'), equalTo(ip)));
            if(ipLogsSnapshot.exists()) {
                const logs = ipLogsSnapshot.val();
                const registrationExists = Object.values(logs).some((log: any) => log.action === 'Register');
                 if (registrationExists) {
                    return { message: "An account has already been registered from this IP address.", isError: true };
                }
            }
        }

        if (securitySettings.antiVpnEnabled && securitySettings.ipinfoApiToken) {
            try {
                const response = await fetch(`https://ipinfo.io/${ip}/json?token=${securitySettings.ipinfoApiToken}`);
                if (!response.ok) {
                    console.warn(`IPinfo API call failed with status: ${response.status}`);
                    // Optionally proceed or block, for now we proceed but log a warning
                } else {
                    const ipData = await response.json();
                    if (ipData.privacy?.vpn || ipData.privacy?.proxy || ipData.privacy?.hosting) {
                        return { message: "Registrations from VPNs, proxies, or hosting services are not allowed.", isError: true };
                    }
                }
            } catch (ipinfoError) {
                 console.error("IPinfo API check failed:", ipinfoError);
                 // Decide whether to block or allow if the check fails. For now, allow but log.
            }
        }
        
        const usersRef = ref(db, 'users');
        const userQuery = query(usersRef, orderByChild('email'), equalTo(email));
        const userSnapshot = await get(userQuery);
        if (userSnapshot.exists()) {
            return { message: "An account with this email already exists.", isError: true };
        }
        
        const smtpSettingsRef = ref(db, 'settings/smtp');
        const smtpSnapshot = await get(smtpSettingsRef);
        const requireVerification = smtpSnapshot.exists() ? smtpSnapshot.val().requireVerification : true;

        const newUserRef = push(usersRef);
        const newUser = {
            email: email,
            password: password, // In a real app, this should be hashed
            createdAt: new Date().toISOString(),
            status: requireVerification ? 'Pending' : 'Active'
        };
        await set(newUserRef, newUser);

        await logAuthEvent({ email, action: 'Register' });
        
        if (requireVerification) {
            await handleLoginVerification(email, 'verification');
            return {
                message: "Account created! We've sent a verification code to your email.",
                isError: false,
                success: true,
                requiresVerification: true,
                email: email
            };
        }
        
        return { message: 'Account created successfully! Redirecting to login...', isError: false, success: true };

    } catch (error) {
        console.error("Registration Error:", error);
        return { message: `Failed to create account: ${error instanceof Error ? error.message : 'Please try again later.'}`, isError: true };
    }
}


// SMTP Settings Action
const smtpSettingsSchema = z.object({
  smtpHost: z.string().min(1, 'SMTP Host is required'),
  smtpPort: z.coerce.number().int().min(1, "Port must be a positive number"),
  smtpUser: z.string().email('A valid email address is required for the username'),
  smtpPass: z.string().optional(),
  requireVerification: z.coerce.boolean(),
});

export type SmtpFormState = {
    message: string;
    errors?: Record<string, string>;
    isError: boolean;
};

export async function saveSmtpSettings(prevState: SmtpFormState, formData: FormData): Promise<SmtpFormState> {
    const settingsData = {
        smtpHost: formData.get('smtpHost'),
        smtpPort: formData.get('smtpPort'),
        smtpUser: formData.get('smtpUser'),
        smtpPass: formData.get('smtpPass'),
        requireVerification: formData.get('requireVerification') === 'on',
    };

    const validatedFields = smtpSettingsSchema.safeParse(settingsData);

    if (!validatedFields.success) {
        const errors: Record<string, string> = {};
        for (const [key, value] of Object.entries(validatedFields.error.flatten().fieldErrors)) {
            errors[key] = value.join(', ');
        }
        return {
            message: "Validation failed. Please check the form.",
            errors,
            isError: true,
        };
    }

    try {
        const settingsRef = ref(db, 'settings/smtp');
        
        // If password is blank, we don't want to overwrite the existing one.
        const currentSettingsSnap = await get(settingsRef);
        const currentSettings = currentSettingsSnap.val() || {};

        const dataToSave = { ...validatedFields.data };
        if (!dataToSave.smtpPass) {
            dataToSave.smtpPass = currentSettings.smtpPass || '';
        }
        
        await set(settingsRef, dataToSave);
        return { message: 'SMTP settings saved successfully!', isError: false };
    } catch (error) {
        console.error(error);
        return { message: 'Failed to save SMTP settings.', isError: true };
    }
}


export async function handleLoginVerification(email: string, type: 'login' | 'verification' = 'login') {
    try {
        const usersRef = ref(db, 'users');
        const q = query(usersRef, orderByChild('email'), equalTo(email));
        const snapshot = await get(q);

        if (!snapshot.exists()) {
            return { success: false, message: 'User not found.' };
        }

        const userId = Object.keys(snapshot.val())[0];
        
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 10 * 60 * 1000; // 10 minutes from now

        await update(ref(db, `users/${userId}`), {
            loginVerificationCode: verificationCode,
            loginVerificationExpires: expires
        });

        const subject = type === 'login' ? 'Your Login Verification Code' : 'Activate Your Account';
        
        await sendEmail({
            to: email,
            subject: subject,
            type: type,
            payload: {
                code: verificationCode
            }
        });

        return { success: true, message: 'Verification code sent.' };
    } catch (error) {
        console.error(`Error in handleLoginVerification for type ${type}: `, error);
        const message = error instanceof Error ? error.message : 'Failed to send verification code.';
        return { success: false, message };
    }
}


export type PasswordResetFormState = {
  message: string;
  isError: boolean;
  success?: boolean;
  email?: string;
};

const passwordResetRequestSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
});

export async function handlePasswordResetRequest(prevState: PasswordResetFormState, formData: FormData): Promise<PasswordResetFormState> {
    const validatedFields = passwordResetRequestSchema.safeParse({
        email: formData.get('email'),
    });
    
    if (!validatedFields.success) {
        return { message: validatedFields.error.flatten().fieldErrors.email?.[0] || 'Invalid input.', isError: true };
    }

    const { email } = validatedFields.data;

    try {
        const usersRef = ref(db, 'users');
        const q = query(usersRef, orderByChild('email'), equalTo(email));
        const snapshot = await get(q);

        if (!snapshot.exists()) {
            // Don't reveal if the user exists or not for security reasons.
            return { message: 'If an account with that email exists, we have sent instructions to reset your password.', isError: false };
        }

        const userId = Object.keys(snapshot.val())[0];
        const resetOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const resetOtpExpires = Date.now() + 600000; // 10 minutes

        await update(ref(db, `users/${userId}`), {
            resetOtp,
            resetOtpExpires,
        });
        
        await sendEmail({
            to: email,
            subject: 'Your Password Reset Code',
            type: 'password-reset-otp',
            payload: {
                code: resetOtp,
            },
        });
        
        return { 
            message: 'An OTP has been sent to your email address.', 
            isError: false,
            success: true,
            email: email,
        };

    } catch (error) {
        console.error("Password Reset Request Error:", error);
        // Generic error to avoid leaking information
        return { message: 'An error occurred. Please try again later.', isError: true };
    }
}


const resetPasswordSchema = z.object({
    email: z.string().email({ message: "Please enter a valid email address." }),
    otp: z.string().min(6, { message: "OTP must be 6 digits." }).max(6),
    password: z.string().min(6, { message: "Password must be at least 6 characters." }),
    confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
});

export async function handlePasswordReset(prevState: PasswordResetFormState, formData: FormData): Promise<PasswordResetFormState> {
    const validatedFields = resetPasswordSchema.safeParse(Object.fromEntries(formData));

    if (!validatedFields.success) {
         const errors = validatedFields.error.flatten().fieldErrors;
         const firstError = Object.values(errors)[0]?.[0] ?? 'Invalid input.';
         return { message: firstError, isError: true };
    }
    
    const { email, otp, password } = validatedFields.data;

    try {
        const usersRef = ref(db, 'users');
        const q = query(usersRef, orderByChild('email'), equalTo(email));
        const snapshot = await get(q);

        if (!snapshot.exists()) {
            return { message: 'Invalid OTP or email address.', isError: true };
        }
        
        const userId = Object.keys(snapshot.val())[0];
        const user = snapshot.val()[userId];

        if (user.resetOtp !== otp || user.resetOtpExpires < Date.now()) {
             return { message: 'Invalid or expired OTP.', isError: true };
        }

        await update(ref(db, `users/${userId}`), {
            password: password, // In a real app, this should be hashed
            resetOtp: null,
            resetOtpExpires: null,
        });

        return { message: 'Password has been reset successfully! You can now log in.', isError: false, success: true };

    } catch (error) {
        console.error("Password Reset Error:", error);
        return { message: 'An error occurred. Please try again.', isError: true };
    }
}

// Advertisement Settings Action
const adSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(3, "Ad name is required"),
  enabled: z.boolean().default(true),
  location: z.enum(['home', 'dashboard', 'order', 'forgot_password'], { required_error: "Location is required" }),
  type: z.enum(['closable', 'nonClosable', 'floating'], { required_error: "Ad type is required" }),
  closableAdCode: z.string().optional(),
  nonClosableAdMessage: z.string().optional(),
  nonClosableAdCode: z.string().optional(),
  nonClosableAdDuration: z.coerce.number().int().min(0, "Duration must be a positive number.").optional(),
  floatingAdMessage: z.string().optional(),
});


export async function saveAdvertisement(data: z.infer<typeof adSchema>) {
    const validatedAd = adSchema.parse(data);
    const { id, ...adData } = validatedAd;
    
    const adRef = id 
        ? ref(db, `settings/advertisements/${id}`) 
        : push(ref(db, 'settings/advertisements'));

    await set(adRef, adData);
}

// Homepage Settings Action
const homepageSettingsSchema = z.object({
  message: z.string().min(1, 'Message is required.'),
  featuredPlanIds: z.array(z.string()).optional().default([]),
});

export async function saveHomepageSettings(data: z.infer<typeof homepageSettingsSchema>) {
    const validatedData = homepageSettingsSchema.parse(data);
    const settingsRef = ref(db, 'settings/homepage');
    await set(settingsRef, validatedData);
}

// Update Ticket Status
export async function updateTicketStatus(ticketId: string, status: 'Open' | 'In Progress' | 'Answered' | 'Closed') {
    const ticketRef = ref(db, `tickets/${ticketId}`);
    await update(ticketRef, { status });
    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath('/admin/tickets');
}

// Post Reply
export async function postReply(ticketId: string, replyText: string, author: 'admin' | 'user', authorName: string) {
    if (!replyText.trim()) {
        throw new Error("Reply cannot be empty.");
    }

    const reply = {
        author,
        authorName,
        message: replyText,
        timestamp: new Date().toISOString(),
    };
    
    const repliesRef = ref(db, `tickets/${ticketId}/replies`);
    const newReplyRef = push(repliesRef);
    await set(newReplyRef, reply);

    // If admin replies, set status to Answered
    if (author === 'admin') {
        await updateTicketStatus(ticketId, 'Answered');
    } else {
        await updateTicketStatus(ticketId, 'In Progress');
    }

    revalidatePath(`/admin/tickets/${ticketId}`);
    revalidatePath(`/dashboard/support/tickets/${ticketId}`);
}

// Admin Ticket Bulk Actions
export async function clearAllTickets() {
    const ticketsRef = ref(db, 'tickets');
    await remove(ticketsRef);
    revalidatePath('/admin/tickets');
}

export async function bulkAutoReply() {
    const ticketsRef = ref(db, 'tickets');
    const snapshot = await get(ticketsRef);

    if (snapshot.exists()) {
        const tickets = snapshot.val();
        const updates: { [key: string]: any } = {};
        const replyMessage = "Your problem will be solved within a few days.";

        for (const ticketId in tickets) {
            // Only reply to tickets that are not already closed or answered by an admin recently
            if (tickets[ticketId].status === 'Open' || tickets[ticketId].status === 'In Progress') {
                const reply = {
                    author: 'admin',
                    authorName: 'System Bot',
                    message: replyMessage,
                    timestamp: new Date().toISOString(),
                };
                
                const newReplyRef = push(ref(db, `tickets/${ticketId}/replies`));
                updates[`tickets/${ticketId}/replies/${newReplyRef.key}`] = reply;
                updates[`tickets/${ticketId}/status`] = 'Answered';
            }
        }
        
        if (Object.keys(updates).length > 0) {
            await update(ref(db), updates);
        }
    }
    revalidatePath('/admin/tickets');
}
