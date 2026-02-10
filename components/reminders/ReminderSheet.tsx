"use client";

import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { ReminderForm } from "./ReminderForm";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ClipboardEdit, PlusCircle } from "lucide-react";

export function ReminderSheet() {
    const { open, close, editingReminder, setOpen } = useReminderModal();

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent>
                <SheetHeader>
                    <div className="flex items-center gap-2">
                        {editingReminder ? (
                            <ClipboardEdit className="h-5 w-5 text-primary" />
                        ) : (
                            <PlusCircle className="h-5 w-5 text-primary" />
                        )}
                        <SheetTitle>{editingReminder ? "Edit Reminder" : "New Reminder"}</SheetTitle>
                    </div>
                    <SheetDescription>
                        {editingReminder
                            ? "Update the details of your reminder."
                            : "Fill in the details to create a new reminder."}
                    </SheetDescription>
                </SheetHeader>
                <ReminderForm
                    initialData={editingReminder}
                    onSuccess={close}
                />
            </SheetContent>
        </Sheet>
    );
}
