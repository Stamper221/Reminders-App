import { AuthForm } from "@/components/auth/AuthForm";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sign Up — Reminders",
    description: "Create a new Reminders account",
};

export default function SignupPage() {
    return (
        <div className="flex flex-col items-center justify-center space-y-4">
            <AuthForm mode="signup" />
        </div>
    );
}
