
"use client";

import { RoutineEditor } from "@/components/routines/RoutineEditor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CreateRoutinePage() {
    return (
        <div className="container max-w-2xl py-6">
            <div className="flex items-center gap-4 mb-6">
                <Link href="/routines">
                    <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
                </Link>
                <h1 className="text-2xl font-bold">New Routine</h1>
            </div>
            <RoutineEditor mode="create" />
        </div>
    );
}
