
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plan } from '@/app/admin/plans/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, CreditCard, Loader2, CheckCircle, Wallet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { orderService } from '@/lib/actions';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';

interface CheckoutFormProps {
    plan: Plan;
}

interface GatewaySettings {
    fakeGateway: { enabled: boolean; qrCodeUrl?: string };
    razorpay: { enabled: boolean };
}

export function CheckoutForm({ plan }: CheckoutFormProps) {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { toast } = useToast();
    const router = useRouter();
    const { userId, userEmail } = useAuth();
    const [paymentMethod, setPaymentMethod] = useState('');
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [gateways, setGateways] = useState<GatewaySettings | null>(null);
    const [loadingGateways, setLoadingGateways] = useState(true);

    useEffect(() => {
        const fetchGatewaySettings = async () => {
            try {
                const settingsRef = ref(db, 'settings/gateways');
                const snapshot = await get(settingsRef);
                if (snapshot.exists()) {
                    const settings = snapshot.val();
                    setGateways(settings);
                    // Set default payment method
                    if (settings.fakeGateway?.enabled) setPaymentMethod('fake');
                    else if (settings.razorpay?.enabled) setPaymentMethod('razorpay');
                } else {
                    // Fallback to fake gateway if no settings exist
                    setGateways({ fakeGateway: { enabled: true }, razorpay: { enabled: false } });
                    setPaymentMethod('fake');
                }
            } catch (error) {
                console.error("Failed to fetch gateway settings", error);
                // Fallback to fake gateway on error
                setGateways({ fakeGateway: { enabled: true }, razorpay: { enabled: false } });
                setPaymentMethod('fake');
            } finally {
                setLoadingGateways(false);
            }
        };
        fetchGatewaySettings();
    }, []);

    const handlePayment = async () => {
        if (!userId) {
            toast({
                variant: 'destructive',
                title: 'Error',
                description: 'You must be logged in to place an order.',
            });
            return;
        }

        setIsSubmitting(true);
        // Simulate payment processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            await orderService({ plan, userId, paymentMethod });
            setPaymentSuccess(true);
            
            // Redirect after a short delay to show success message
            setTimeout(() => {
                toast({
                    title: "Order Successful!",
                    description: `You have successfully ordered the ${plan.name} plan.`,
                });
                router.push('/dashboard/services');
            }, 2000);

        } catch (err) {
            toast({
                variant: "destructive",
                title: "Order Failed",
                description: "There was an error placing your order. Please try again.",
            });
            console.error(err);
            setIsSubmitting(false);
        }
    }


    return (
        <Card>
            {step === 1 && (
                <>
                    <CardHeader>
                        <CardTitle>Step 1: Contact Information</CardTitle>
                        <CardDescription>Confirm your details for the invoice.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email Address</Label>
                            <Input id="email" defaultValue={userEmail || ''} disabled />
                        </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="address">Address</Label>
                                <Input id="address" placeholder="123 Main St" />
                            </div>
                             <div className="space-y-2">
                                <Label htmlFor="pincode">PIN Code</Label>
                                <Input id="pincode" placeholder="12345" />
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="justify-end">
                        <Button onClick={() => setStep(2)}>Next: Review Invoice</Button>
                    </CardFooter>
                </>
            )}

            {step === 2 && (
                <>
                    <CardHeader>
                        <CardTitle>Step 2: Review Invoice</CardTitle>
                        <CardDescription>Please review your order details before proceeding to payment.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Alert>
                            <AlertTitle>Invoice Summary</AlertTitle>
                            <AlertDescription>
                                <div className="flex justify-between py-2 border-b">
                                    <span>Plan: {plan.name}</span>
                                    <span>₹{plan.price.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between py-2 font-bold">
                                    <span>Total Due Today</span>
                                    <span>₹{plan.price.toFixed(2)}</span>
                                </div>
                            </AlertDescription>
                        </Alert>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                         <Button variant="outline" onClick={() => setStep(1)}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                        <Button onClick={() => setStep(3)}>Next: Payment</Button>
                    </CardFooter>
                </>
            )}

            {step === 3 && (
                 <>
                    <CardHeader>
                        <CardTitle>Step 3: Complete Payment</CardTitle>
                        <CardDescription>Choose your preferred payment method.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {paymentSuccess ? (
                            <div className="text-center flex flex-col items-center gap-4 py-8">
                                <CheckCircle className="h-16 w-16 text-green-500" />
                                <h2 className="text-2xl font-bold">Payment Successful!</h2>
                                <p className="text-muted-foreground">Your order is being processed. You will be redirected shortly.</p>
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : loadingGateways ? (
                            <div className="space-y-4">
                                <Skeleton className="h-20 w-full" />
                                <Skeleton className="h-20 w-full" />
                            </div>
                        ) : (
                            <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod}>
                                {gateways?.fakeGateway?.enabled && (
                                     <Label
                                        htmlFor="fake"
                                        className="flex items-center space-x-3 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                    >
                                        <RadioGroupItem value="fake" id="fake" />
                                        <div className="flex flex-col">
                                            <span className="font-semibold">Credit/Debit Card or UPI</span>
                                            <span className="text-sm text-muted-foreground">Pay securely (Test Gateway).</span>
                                        </div>
                                    </Label>
                                )}
                                {gateways?.razorpay?.enabled && (
                                    <Label
                                        htmlFor="razorpay"
                                        className="flex items-center space-x-3 rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
                                    >
                                        <RadioGroupItem value="razorpay" id="razorpay" />
                                        <div className="flex flex-col">
                                            <span className="font-semibold">Pay with Razorpay</span>
                                            <span className="text-sm text-muted-foreground">Accepts Cards, UPI, Netbanking.</span>
                                        </div>
                                    </Label>
                                )}
                            </RadioGroup>
                        )}
                        
                        {paymentMethod === 'fake' && !paymentSuccess && (
                            <div className="flex flex-col items-center justify-center p-4 border rounded-md bg-background">
                                <p className="mb-2 text-sm font-medium">Scan this QR code to pay (for testing)</p>
                                <Image
                                    src={gateways?.fakeGateway?.qrCodeUrl || "https://placehold.co/200x200.png"}
                                    alt="Fake QR Code"
                                    width={200}
                                    height={200}
                                    data-ai-hint="qr code"
                                />
                            </div>
                        )}
                    </CardContent>
                    <CardFooter className="flex justify-between">
                         <Button variant="outline" onClick={() => setStep(2)} disabled={isSubmitting || paymentSuccess}>
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back
                        </Button>
                        <Button onClick={handlePayment} disabled={isSubmitting || paymentSuccess || loadingGateways || !paymentMethod}>
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Wallet className="mr-2 h-4 w-4" />
                                    Pay Now
                                </>
                            )}
                        </Button>
                    </CardFooter>
                 </>
            )}
        </Card>
    )
}
