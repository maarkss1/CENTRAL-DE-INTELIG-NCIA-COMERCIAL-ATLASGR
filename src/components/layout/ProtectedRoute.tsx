export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    // TEMPORARY: Bypass login check
    return <>{children}</>;
}
