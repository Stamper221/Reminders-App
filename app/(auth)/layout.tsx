export default function AuthLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
            style={{
                background: 'linear-gradient(135deg, var(--background) 0%, var(--accent) 50%, var(--background) 100%)',
            }}
        >
            {/* Decorative blobs */}
            <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-20"
                style={{ background: 'var(--gradient-primary)', filter: 'blur(100px)' }}
            />
            <div className="absolute bottom-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full opacity-15"
                style={{ background: 'var(--gradient-primary)', filter: 'blur(80px)' }}
            />
            <div className="relative z-10 animate-fade-in">
                {children}
            </div>
        </div>
    );
}
