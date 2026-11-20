// Diri ang welcome page.
export default function Welcome() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
            <div className="w-full max-w-xl rounded-xl border border-line bg-white p-10 text-center shadow-sm">
                <img
                    src="/images/el_salvador_city_vet_logo.png"
                    alt="Office of the City Veterinarian"
                    className="mx-auto mb-5 h-24 w-24 rounded-full bg-white object-contain"
                />
                <h1 className="mb-4 text-3xl font-bold text-navy">ES CityVet</h1>
                <p className="mb-8 text-base text-muted">
                    El Salvador City Veterinary Office management system.
                </p>
                <a
                    href="/admin/login"
                    className="inline-flex rounded-lg bg-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-dark"
                >
                    Staff Sign In
                </a>
            </div>
        </div>
    );
}
