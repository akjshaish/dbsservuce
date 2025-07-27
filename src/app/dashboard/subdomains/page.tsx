
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubdomainForm } from "./subdomain-form";
import { SubdomainList } from "./subdomain-list";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

export default function SubdomainsPage() {
  const { userId, loading } = useAuth();

  if (loading) {
      return (
          <div className="space-y-8">
              <Skeleton className="h-12 w-1/2" />
              <Card>
                  <CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader>
                  <CardContent><Skeleton className="h-24 w-full" /></CardContent>
              </Card>
              <Card>
                  <CardHeader><Skeleton className="h-8 w-1/3" /></CardHeader>
                  <CardContent><Skeleton className="h-48 w-full" /></CardContent>
              </Card>
          </div>
      )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-headline">Manage Domains</h1>
        <p className="text-sm text-muted-foreground">
          View, register, and manage your subdomains.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Register a New Subdomain</CardTitle>
          <CardDescription>
            Enter your desired subdomain below. Our AI will check its availability.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubdomainForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Subdomains</CardTitle>
          <CardDescription>
            A list of all your registered subdomains.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubdomainList userId={userId!} />
        </CardContent>
      </Card>
    </div>
  );
}
