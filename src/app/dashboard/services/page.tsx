
'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlusCircle, Server, Settings, Link as LinkIcon, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import { Box } from "lucide-react";
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import type { Plan } from '@/app/admin/plans/page';
import { useAuth } from '@/hooks/use-auth';

export interface Service extends Plan {
    id: string;
    orderDate: string;
    status: 'Active' | 'Suspended' | 'Terminated' | 'Banned' | 'Pending';
    subdomain?: string;
}

export default function ServicesPage() {
    const [services, setServices] = useState<Service[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { userId } = useAuth();


    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        };

        const fetchServices = async () => {
            try {
                const servicesRef = ref(db, `users/${userId}/services`);
                const snapshot = await get(servicesRef);
                if (snapshot.exists()) {
                    const servicesData = snapshot.val();
                    const servicesArray = Object.keys(servicesData).map(key => ({
                        id: key,
                        ...servicesData[key]
                    }));
                    setServices(servicesArray);
                } else {
                    setServices([]);
                }
            } catch (err) {
                setError('Failed to fetch services. Please check your database connection.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        fetchServices();
    }, [userId]);

    const handleManageClick = (serviceId: string) => {
        router.push(`/dashboard/services/${serviceId}`);
    };

    const getStatusVariant = (status: Service['status']) => {
        switch (status) {
            case 'Active': return 'default';
            case 'Suspended': return 'secondary';
            case 'Terminated': return 'outline';
            case 'Banned': return 'destructive';
            case 'Pending': return 'secondary';
            default: return 'default';
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold font-headline">My Services</h1>
                    <p className="text-sm text-muted-foreground">
                        View and manage your active hosting services.
                    </p>
                </div>
                <Button asChild>
                    <Link href="/dashboard/order">
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Order New Service
                    </Link>
                </Button>
            </div>

            {error && <p className="text-destructive">{error}</p>}
            
            {loading ? (
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Card key={i}><CardContent className="p-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
                    ))}
                 </div>
            ) : services.length > 0 ? (
                 <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {services.map((service) => (
                        <Card key={service.id} className="flex flex-col">
                            <CardHeader>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <CardTitle className="text-xl">{service.name} Plan</CardTitle>
                                        <CardDescription>Ordered: {new Date(service.orderDate).toLocaleDateString()}</CardDescription>
                                    </div>
                                    <Badge variant={getStatusVariant(service.status)}>{service.status}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent className="flex-1">
                                 {service.subdomain ? (
                                    <div className="p-3 rounded-md bg-secondary text-sm font-medium flex items-center justify-between">
                                        <a href={`http://${service.subdomain}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                                            <ExternalLink className="h-4 w-4" />
                                            {service.subdomain}
                                        </a>
                                    </div>
                                ) : (
                                     <div className="p-3 rounded-md bg-secondary text-sm text-muted-foreground flex items-center gap-2">
                                        <LinkIcon className="h-4 w-4" />
                                        <span>No Subdomain Assigned</span>
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter>
                                 <Button className="w-full" onClick={() => handleManageClick(service.id)}>
                                    <Settings className="mr-2 h-4 w-4" /> Manage
                                </Button>
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            ) : (
                 <Card>
                    <CardHeader>
                        <CardTitle>Your Active Products/Services</CardTitle>
                    </CardHeader>
                    <CardContent className="text-center text-muted-foreground py-12">
                        <Box className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                        <p>No Active Services Found</p>
                        <Button variant="link" asChild>
                            <Link href="/dashboard/order">Order New Services</Link>
                        </Button>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
