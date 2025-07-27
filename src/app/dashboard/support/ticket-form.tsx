
'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { handleTicketSubmission, type FormState } from '@/lib/actions';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const initialState: FormState = {
  message: '',
  isError: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? 'Submitting...' : 'Submit Ticket'}
    </Button>
  );
}

export function TicketForm() {
  const [state, formAction] = useActionState(handleTicketSubmission, initialState);
  const { userId, userEmail } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (state.ticketId) {
        // Redirect to the newly created ticket page
        router.push(`/dashboard/support/tickets/${state.ticketId}`);
    }
  }, [state.ticketId, router]);


  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Subject</Label>
        <Input id="title" name="title" placeholder="e.g., Website is down" required />
        {state.fields?.title && (
          <p className="text-sm text-destructive">{state.fields.title}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          placeholder="Please provide a detailed description of the issue."
          required
          rows={6}
        />
        {state.fields?.description && (
          <p className="text-sm text-destructive">{state.fields.description}</p>
        )}
      </div>
      <input type="hidden" name="userType" value="paying" />
      <input type="hidden" name="userEmail" value={userEmail || ''} />
      <input type="hidden" name="userId" value={userId || ''} />
      <SubmitButton />

      {state.message && !state.result && (
        <Alert variant={state.isError ? 'destructive' : 'default'} className="mt-4">
          {state.isError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
          <AlertTitle>{state.isError ? 'Error' : 'Processing...'}</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
