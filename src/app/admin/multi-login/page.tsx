
'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { ref, get } from 'firebase/database';
import { saveSecuritySettings } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuthLog } from '../logs/page';

interface GroupedLog {
    ip: string;
    emails: string[];
    count: number;
}

export default function AdminMultiLoginPage() {
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [protectionEnabled, setProtectionEnabled] = useState(false);
    const [groupedLogs, setGroupedLogs] = useState<GroupedLog[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch Security Settings
                const settingsRef = ref(db, 'settings/security');
                const settingsSnapshot = await get(settingsRef);
                if (settingsSnapshot.exists()) {
                    setProtectionEnabled(settingsSnapshot.val().multiLoginProtectionEnabled || false);
                }

                // Fetch and process Auth Logs
                const logsRef = ref(db, 'auth_logs');
                const logsSnapshot = await get(logsRef);
                if (logsSnapshot.exists()) {
                    const logsData: { [key: string]: AuthLog } = logsSnapshot.val();
                    
                    const logsByIp: { [ip: string]: string[] } = {};

                    for (const key in logsData) {
                        const log = logsData[key];
                        if (log.action === 'Register') {
                            if (!logsByIp[log.ip]) {
                                logsByIp[log.ip] = [];
                            }
                            // Avoid duplicate emails for the same IP
                            if (!logsByIp[log.ip].includes(log.email)) {
                                logsByIp[log.ip].push(log.email);
                            }
                        }
                    }

                    const filteredAndGrouped = Object.entries(logsByIp)
                        .map(([ip, emails]) => ({ ip, emails, count: emails.length }))
                        .filter(group => group.count > 1)
                        .sort((a, b) => b.count - a.count);
                    
                    setGroupedLogs(filteredAndGrouped);
                }

            } catch (error) {
                 toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Failed to fetch data.",
                });
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [toast]);

    const handleSave = async () => {
        setIsSubmitting(true);
        try {
            await saveSecuritySettings({ multiLoginProtectionEnabled: protectionEnabled });
            toast({
                title: 'Success',
                description: 'Settings saved successfully.'
            });
        } catch (error) {
             toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to save settings.",
            });
        } finally {
            setIsSubmitting(false);
        }
    }


    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold font-headline">Multi-Login Management</h1>
                <p className="text-sm text-muted-foreground">
                    Monitor and prevent multiple account registrations from the same IP.
                </p>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>Protection Status</CardTitle>
                    <CardDescription>Enable this to prevent users from creating multiple accounts with the same IP address.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <Skeleton className="h-8 w-48" />
                    ) : (
                         <div className="flex items-center space-x-2">
                            <Switch
                                id="protection-switch"
                                checked={protectionEnabled}
                                onCheckedChange={setProtectionEnabled}
                                disabled={isSubmitting}
                            />
                            <Label htmlFor="protection-switch">Enable Multi-Login Protection</Label>
                        </div>
                    )}
                </CardContent>
                <CardFooter>
                    <Button onClick={handleSave} disabled={isSubmitting || loading}>
                         {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Settings
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Duplicate IP Registrations</CardTitle>
                    <CardDescription>This list shows IP addresses that have been used to register more than one account.</CardDescription>
                </CardHeader>
                 <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>IP Address</TableHead>
                                <TableHead>Registered Accounts</TableHead>
                                <TableHead className="text-right">Count</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                Array.from({ length: 3 }).map((_, index) => (
                                    <TableRow key={index}>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-full" /></TableCell>
                                        <TableCell className="text-right"><Skeleton className="h-4 w-8 ml-auto" /></TableCell>
                                    </TableRow>
                                ))
                            ) : groupedLogs.length > 0 ? (
                                groupedLogs.map((log) => (
                                    <TableRow key={log.ip}>
                                        <TableCell className="font-mono">{log.ip}</TableCell>
                                        <TableCell className="text-muted-foreground">{log.emails.join(', ')}</TableCell>
                                        <TableCell className="text-right font-bold">{log.count}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center h-24">
                                        No duplicate IP registrations found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
