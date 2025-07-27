
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function BillingPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Billing</h1>
        <p className="text-sm text-muted-foreground">
          View your invoices and manage payment methods.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>
            Your payment history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">You have no invoices yet.</p>
        </CardContent>
      </Card>
    </div>
  );
}
