
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import type { Service } from '../page';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { SubdomainForm } from '../../subdomains/subdomain-form';
import { ArrowLeft, Globe, LogIn, AlertTriangle, Wrench } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';

interface MaintenanceSettings {
  enabled: boolean;
  type: 'full' | 'partial';
  partialMessage?: string;
}

export default function ManageServicePage() {
    const params = useParams();
    const router = useRouter();
    const { userId } = useAuth();
    const serviceId = typeof params.serviceId === 'string' ? params.serviceId : '';
    
    const [service, setService] = useState<Service | null>(null);
    const [maintenanceSettings, setMaintenanceSettings] = useState<MaintenanceSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!serviceId || !userId) return;

        const fetchServiceAndSettings = async () => {
            try {
                const serviceRef = ref(db, `users/${userId}/services/${serviceId}`);
                const maintenanceRef = ref(db, 'settings/maintenance');

                const [serviceSnapshot, maintenanceSnapshot] = await Promise.all([
                    get(serviceRef),
                    get(maintenanceRef)
                ]);

                if (serviceSnapshot.exists()) {
                    setService({ id: serviceSnapshot.key, ...serviceSnapshot.val() });
                } else {
                    setError("Service not found or you do not have permission to access it.");
                }

                if (maintenanceSnapshot.exists()) {
                    setMaintenanceSettings(maintenanceSnapshot.val());
                }

            } catch (err) {
                console.error(err);
                setError("An error occurred while fetching service details.");
            } finally {
                setLoading(false);
            }
        };
        
        fetchServiceAndSettings();
    }, [serviceId, userId, router]);

    if (loading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96" />
                <Card>
                    <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
                    <CardContent><Skeleton className="h-64 w-full" /></CardContent>
                </Card>
            </div>
        )
    }

    if (error) {
        return (
             <Card className="border-destructive">
                <CardHeader>
                    <CardTitle className="text-destructive">Error</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>{error}</p>
                    <Button onClick={() => router.push('/dashboard/services')} className="mt-4">
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Services
                    </Button>
                </CardContent>
            </Card>
        )
    }

    if (!service) {
        return null;
    }

    if (maintenanceSettings?.enabled && maintenanceSettings.type === 'partial') {
        return (
            <div>
                 <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Services
                </Button>
                 <Alert variant="destructive" className="border-orange-500/50 text-orange-600 dark:text-orange-400 [&>svg]:text-orange-500">
                    <Wrench className="h-4 w-4" />
                    <AlertTitle>Partial Maintenance</AlertTitle>
                    <AlertDescription>
                        {maintenanceSettings.partialMessage || 'Service management is temporarily unavailable due to maintenance.'}
                    </AlertDescription>
                </Alert>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div>
                <Button variant="ghost" onClick={() => router.back()} className="mb-4">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Services
                </Button>
                <h1 className="text-3xl font-bold font-headline">Manage Service</h1>
                <p className="text-sm text-muted-foreground">
                    Managing your <span className="font-semibold text-primary">{service.name}</span> plan.
                </p>
            </div>

            {service.subdomain ? (
                <Card>
                    <CardHeader>
                        <CardTitle>Your Domain</CardTitle>
                        <CardDescription>Your service is linked to the following domain.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-md bg-secondary">
                             <a 
                                href={`http://${service.subdomain}`} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary font-semibold hover:underline flex items-center gap-2"
                            >
                                <Globe className="h-5 w-5" />
                                {service.subdomain}
                            </a>
                             <Button asChild>
                                <Link href={`/dashboard/cpanel/${encodeURIComponent(service.subdomain)}`}>
                                    <LogIn className="mr-2 h-4 w-4" />
                                    Login to cPanel
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle>Assign a Subdomain</CardTitle>
                        <CardDescription>
                            Your hosting plan needs a subdomain. Register a free one below to get started.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <SubdomainForm serviceId={service.id} />
                    </CardContent>
                </Card>
            )}

            {/* Placeholder for other service management options */}
        </div>
    );
}
