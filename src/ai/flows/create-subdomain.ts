
'use server';

/**
 * @fileOverview This file contains a Genkit flow for creating a new subdomain,
 * interacting with a real cPanel API.
 *
 * - createSubdomain - A function that handles the subdomain creation process.
 * - CreateSubdomainInput - The input type for the createSubdomain function.
 * - CreateSubdomainOutput - The return type for the createSubdomain function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';

const CreateSubdomainInputSchema = z.object({
  subdomain: z
    .string()
    .min(3, 'Subdomain must be at least 3 characters long.')
    .max(30, 'Subdomain must be no more than 30 characters long.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.'),
    isTest: z.boolean().optional().default(false),
});
export type CreateSubdomainInput = z.infer<typeof CreateSubdomainInputSchema>;

const CreateSubdomainOutputSchema = z.object({
  success: z.boolean().describe('Whether the subdomain creation was successful.'),
  message: z.string().describe('A message detailing the result of the operation.'),
  subdomain: z.string().optional().describe('The full subdomain name that was created.'),
});
export type CreateSubdomainOutput = z.infer<typeof CreateSubdomainOutputSchema>;

// Define a schema for cPanel provider settings for clarity and validation
const CpanelProviderSettingsSchema = z.object({
    host: z.string().min(1, 'cPanel Host is missing (e.g., your-domain.com).'),
    port: z.number().int().default(2083),
    username: z.string().min(1, 'cPanel Username is missing.'),
    apiToken: z.string().min(1, 'cPanel API Token is missing.'),
});

const checkSubdomainAvailability = ai.defineTool(
  {
    name: 'checkSubdomainAvailability',
    description: 'Check if a subdomain is available or already taken by querying the cPanel API.',
    inputSchema: z.object({ 
        subdomain: z.string(), 
        domain: z.string(),
        cpanelProvider: CpanelProviderSettingsSchema
    }),
    outputSchema: z.object({
      isAvailable: z.boolean(),
      reason: z.string().optional(),
     }),
  },
  async ({ subdomain, domain, cpanelProvider }) => {
    // =================================================================
    // DEVELOPER: This is a real implementation example for cPanel UAPI.
    // =================================================================
    const { host, port, username, apiToken } = cpanelProvider;
    const url = `https://${host}:${port}/execute/SubDomain/list_subdomains`;

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `cpanel ${username}:${apiToken}` }
        });

        if (!response.ok) {
           const errorText = await response.text();
           return { isAvailable: false, reason: `Could not verify availability. cPanel API responded with status ${response.status}: ${errorText}` };
        }
        
        const data = await response.json();
        
        if (data.status === 0) { // cPanel API error status
            return { isAvailable: false, reason: data.errors[0] || 'Unknown cPanel API error during check.' };
        }
        
        const fullSubdomain = `${subdomain}.${domain}`;
        const isTaken = data.data.some((d: any) => d.subdomain === subdomain || d.domain === fullSubdomain);

        if (isTaken) {
            return { isAvailable: false, reason: 'This subdomain is already taken.' };
        } else {
            return { isAvailable: true };
        }
    } catch (error) {
        console.error("cPanel availability check failed:", error);
        return { isAvailable: false, reason: 'An error occurred while communicating with the cPanel API.' };
    }
  }
);


export async function createSubdomain(input: CreateSubdomainInput): Promise<CreateSubdomainOutput> {
  return createSubdomainFlow(input);
}

const prompt = ai.definePrompt({
  name: 'createSubdomainPrompt',
  input: {schema: z.object({ 
      subdomain: z.string(), 
      domain: z.string(),
      cpanelProvider: CpanelProviderSettingsSchema,
  })},
  output: {schema: CreateSubdomainOutputSchema},
  tools: [checkSubdomainAvailability],
  prompt: `You are an AI assistant that manages subdomain creation for the domain '{{{domain}}}'.

Subdomain requested: {{{subdomain}}}

Follow these rules strictly:
1.  **Check for profanity or offensive terms.** If the subdomain contains any, reject it with an appropriate message (e.g., "This subdomain is not allowed.").
2.  **Use the checkSubdomainAvailability tool** to verify if the subdomain is available on the '{{{domain}}}' domain. You must pass the cpanelProvider details to the tool.
3.  **If the tool says it is unavailable**, respond with the exact reason provided by the tool.
4.  **If all checks pass,** approve the creation. The success message should be positive and confirm the creation (e.g., "Congratulations! Your subdomain is ready.").
5.  **If any check fails,** reject the creation and provide the specific reason for the failure.

Base your response ONLY on the provided subdomain and the tool output.

Respond with a JSON object containing the success status and a clear message for the user.`,
});

const createSubdomainFlow = ai.defineFlow(
  {
    name: 'createSubdomainFlow',
    inputSchema: CreateSubdomainInputSchema,
    outputSchema: CreateSubdomainOutputSchema,
  },
  async (input) => {
    // Fetch Domain settings from Firebase
    const domainSettingsRef = ref(db, 'settings/domain');
    const domainSnapshot = await get(domainSettingsRef);
    const domainSettings = domainSnapshot.val() || {};
    const domainToUse = domainSettings.domain;

    if (!domainToUse) {
         return {
            success: false,
            message: 'DNS domain is not configured in the admin settings.',
        }
    }
    
    // Fetch cPanel settings from Firebase
    const dnsSettingsRef = ref(db, 'settings/dns');
    const dnsSnapshot = await get(dnsSettingsRef);
    const dnsSettings = dnsSnapshot.val() || {};

    if (!input.isTest && !dnsSettings.autoDnsEnabled) {
      return {
        success: false,
        message: 'Automatic subdomain creation is currently disabled. Please contact support.',
      };
    }
    
    // Remap DNS settings to cPanel settings for validation
    const cpanelSettingsData = {
        host: dnsSettings.host,
        port: dnsSettings.port,
        username: dnsSettings.username,
        apiToken: dnsSettings.apiToken,
    };

    // Validate cPanel settings from the database
    const validatedCpanelSettings = CpanelProviderSettingsSchema.safeParse(cpanelSettingsData);

    if (!input.isTest && !validatedCpanelSettings.success) {
        const errors = validatedCpanelSettings.error.flatten().fieldErrors;
        const errorMessages = Object.entries(errors).map(([key, value]) => `${key}: ${value}`).join(', ');
        return {
            success: false,
            message: `cPanel provider settings are invalid or incomplete in the admin panel. Please check them. Errors: ${errorMessages}`,
        }
    }
    const cpanelProvider = validatedCpanelSettings.success ? validatedCpanelSettings.data : { host: "test-host", port: 2083, username: "test-user", apiToken: "test-token" };


    const {output} = await prompt({ subdomain: input.subdomain, domain: domainToUse, cpanelProvider });
    
    // Check if the output exists before proceeding.
    if (!output) {
        return {
            success: false,
            message: 'The AI model did not return a response. Please try again.',
        };
    }

    // If test mode is enabled, we simulate a successful result if the AI approved it.
    if (input.isTest) {
        if (output.success) {
            output.subdomain = `${input.subdomain}.${domainToUse}`;
            output.message = `(Test Mode) ${output.message}`;
        }
        return output;
    }

    // If not in test mode, proceed with real creation if successful.
    if (output.success) {
      // =================================================================
      // DEVELOPER: This is a real implementation to create the cPanel subdomain.
      // This creates the subdomain and its document root folder.
      // =================================================================
      
      const { host, port, username, apiToken } = cpanelProvider;
      // Note: The document root should ideally be configurable.
      const documentRoot = `public_html/${input.subdomain}`;
      const url = `https://${host}:${port}/execute/SubDomain/add_subdomain?domain=${input.subdomain}&root_domain=${domainToUse}&document_root=${documentRoot}`;

      try {
          const response = await fetch(url, {
              headers: { 'Authorization': `cpanel ${username}:${apiToken}` }
          });

          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`cPanel API responded with status ${response.status}: ${errorText}`);
          }
          
          const data = await response.json();
          if (data.status === 0) { // cPanel reports an error
            throw new Error(data.errors[0] || 'Unknown cPanel API error during creation.');
          }

          // If creation was successful, populate the full subdomain for the success message
          output.subdomain = `${input.subdomain}.${domainToUse}`;

      } catch (error) {
          console.error("Failed to create cPanel subdomain:", error);
          // If the real API call fails, override the AI's success response
          return {
              success: false,
              message: `The subdomain was approved, but creating it via the cPanel API failed. Please contact support.`,
          }
      }
    }

    return output;
  }
);
