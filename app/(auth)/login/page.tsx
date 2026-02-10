import { AuthForm } from "@/components/auth/AuthForm";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "Login — Reminders",
    description: "Sign in to your Reminders account",
};

export default function LoginPage() {
    return (
        <div className="flex flex-col items-center justify-center space-y-4">
            <AuthForm mode="login" />
        </div>
    );
}
