

'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { handleSubdomainCreation, type SubdomainFormState } from '@/lib/actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Rocket, Loader2, Globe, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { motion } from "framer-motion";
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';

const initialState: SubdomainFormState = {
  message: '',
  isError: false,
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} className="w-full sm:w-auto">
        {pending ? (
            <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
            </>
        ) : (
            <>
                <Rocket className="mr-2 h-4 w-4" />
                Create Subdomain
            </>
        )}
    </Button>
  );
}

export function SubdomainForm({ serviceId }: { serviceId?: string }) {
  const [state, formAction] = useActionState(handleSubdomainCreation, initialState);
  const [domain, setDomain] = useState<string | null>(null);
  const [loadingDomain, setLoadingDomain] = useState(true);
  const { userId } = useAuth();

  useEffect(() => {
    const fetchDomain = async () => {
        try {
            const settingsRef = ref(db, 'settings/domain');
            const snapshot = await get(settingsRef);
            if (snapshot.exists() && snapshot.val().domain) {
                setDomain(snapshot.val().domain);
            } else {
                setDomain(null);
            }
        } catch (error) {
            console.error("Failed to fetch domain", error);
            setDomain(null);
        } finally {
            setLoadingDomain(false);
        }
    }
    fetchDomain();
  }, []);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="userId" value={userId || ''} />
      {serviceId && <input type="hidden" name="serviceId" value={serviceId} />}
      <div className="space-y-2">
        <Label htmlFor="subdomain" className="sr-only">Subdomain</Label>
        <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-full">
                <Input 
                    id="subdomain" 
                    name="subdomain" 
                    placeholder="your-awesome-site" 
                    required 
                    className="pr-[180px] h-12 text-base"
                    disabled={loadingDomain || !domain}
                />
                 <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                    {loadingDomain ? (
                        <Skeleton className="h-4 w-32" />
                    ): domain ? (
                        <>.{domain}</>
                    ) : (
                        <span className="text-destructive text-xs font-medium">Domain not configured</span>
                    )}
                </span>
            </div>
             <SubmitButton disabled={loadingDomain || !domain} />
        </div>
        {state.fields?.subdomain && (
          <p className="text-sm text-destructive mt-2">{state.fields.subdomain}</p>
        )}
      </div>

      {state.message && !state.result?.success && (
         <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
            <Alert variant={state.isError ? 'destructive' : 'default'} className="mt-4">
            {state.isError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            <AlertTitle>{state.isError ? 'Error' : 'Notice'}</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
            </Alert>
         </motion.div>
      )}

      {state.result && state.result.success && state.result.subdomain && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            <Card className="mt-6 bg-secondary/50 border-green-500/50 border">
                <CardHeader>
                    <CardTitle className="flex items-center gap-3 text-lg">
                        <CheckCircle className="h-6 w-6 text-green-500" />
                        Subdomain Created!
                    </CardTitle>
                    <CardDescription>{state.message}</CardDescription>
                </CardHeader>
              <CardContent className="space-y-2">
                <p>Your new subdomain is now active and ready to use:</p>
                <div className="text-lg font-mono bg-background p-3 rounded-md text-primary">
                  <a href={`http://${state.result.subdomain}`} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    {state.result.subdomain}
                  </a>
                </div>
              </CardContent>
              <CardFooter>
                 <Button asChild>
                    <Link href={`/dashboard/cpanel/${encodeURIComponent(state.result.subdomain)}`}>
                        <LogIn className="mr-2 h-4 w-4" />
                        Login to cPanel
                    </Link>
                </Button>
              </CardFooter>
            </Card>
        </motion.div>
      )}
    </form>
  );
}
