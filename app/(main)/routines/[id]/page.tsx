
"use client";

import { RoutineEditor } from "@/components/routines/RoutineEditor";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useState, use } from "react";
import { getRoutine } from "@/lib/routines";
import { useAuth } from "@/components/providers/AuthProvider";
import { Routine } from "@/lib/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function EditRoutinePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    const { user } = useAuth();
    const router = useRouter();
    const [routine, setRoutine] = useState<Routine | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user && resolvedParams.id) {
            loadRoutine();
        }
    }, [user, resolvedParams.id]);

    const loadRoutine = async () => {
        if (!user) return;
        try {
            const data = await getRoutine(user.uid, resolvedParams.id);
            if (!data) {
                toast.error("Routine not found");
                router.push("/routines");
                return;
            }
            setRoutine(data);
        } catch (error) {
            console.error(error);
            toast.error("Failed to load routine");
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (!routine) return null;

    return (
        <div className="container max-w-2xl py-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/routines">
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
                </Link>
                <h1 className="text-2xl font-bold">Edit Routine</h1>
            </div>
            <RoutineEditor mode="edit" initialData={routine} />
        </div>
    );
}
