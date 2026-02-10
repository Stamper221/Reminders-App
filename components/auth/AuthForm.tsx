"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";
import { Loader2, Bell } from "lucide-react";

const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormData = z.infer<typeof schema>;

interface AuthFormProps {
    mode: "login" | "signup";
}

export function AuthForm({ mode }: AuthFormProps) {
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
    });

    const onSubmit = async (data: FormData) => {
        setLoading(true);
        try {
            if (mode === "login") {
                await signInWithEmailAndPassword(auth, data.email, data.password);
                toast.success("Logged in successfully");
            } else {
                await createUserWithEmailAndPassword(auth, data.email, data.password);
                toast.success("Account created successfully");
            }
            router.push("/");
        } catch (error: any) {
            console.error(error);
            toast.error(error.message || "An error occurred");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-[380px] glass border-border/50 card-shadow">
            <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-3 h-12 w-12 rounded-xl gradient-primary flex items-center justify-center">
                    <Bell className="h-6 w-6 text-white" />
                </div>
                <CardTitle className="text-2xl">{mode === "login" ? "Welcome back" : "Create account"}</CardTitle>
                <CardDescription>
                    {mode === "login"
                        ? "Enter your credentials to access your reminders."
                        : "Create a new account to get started."}
                </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit(onSubmit)}>
                <CardContent>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" placeholder="name@example.com" {...register("email")} />
                            {errors.email && (
                                <span className="text-destructive text-xs">{errors.email.message}</span>
                            )}
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" type="password" placeholder="••••••••" {...register("password")} />
                            {errors.password && (
                                <span className="text-destructive text-xs">{errors.password.message}</span>
                            )}
                        </div>
                    </div>
                </CardContent>
                <CardFooter className="flex flex-col gap-3">
                    <Button className="w-full" size="lg" disabled={loading}>
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {mode === "login" ? "Signing in..." : "Creating account..."}
                            </>
                        ) : (
                            mode === "login" ? "Sign In" : "Create Account"
                        )}
                    </Button>
                    <div className="text-sm text-center text-muted-foreground">
                        {mode === "login" ? (
                            <>
                                Don&apos;t have an account?{" "}
                                <Link href="/signup" className="text-primary font-medium hover:underline">
                                    Sign up
                                </Link>
                            </>
                        ) : (
                            <>
                                Already have an account?{" "}
                                <Link href="/login" className="text-primary font-medium hover:underline">
                                    Sign in
                                </Link>
                            </>
                        )}
                    </div>
                </CardFooter>
            </form>
        </Card>
    );
}
