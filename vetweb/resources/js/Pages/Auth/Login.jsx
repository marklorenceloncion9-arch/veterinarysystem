import { useState, useEffect } from 'react';
import { router, usePage } from '@inertiajs/react';
import axios from 'axios';

const LOGIN_BG_IMAGE = '/images/login-bg/IMG4.webp';
const DEFAULT_OTP_EXPIRY_SECONDS = 600;

// Diri i-format ang countdown sa OTP.
function formatOtpCountdown(totalSeconds) {
    const safe = Math.max(0, totalSeconds);
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

// Diri ang button sa pagpakita o pagtago sa password.
function PasswordToggleButton({ visible, onToggle, iconClassName = 'text-gray-400 hover:text-violet-600' }) {
    return (
        <button
            type="button"
            onClick={onToggle}
            className={`absolute inset-y-0 right-0 flex items-center pr-3 ${iconClassName}`}
            tabIndex={-1}
            aria-label={visible ? 'Hide password' : 'Show password'}
        >
            {visible ? (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
            ) : (
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
            )}
        </button>
    );
}

// Diri ang login page.
export default function Login() {
    const { flash } = usePage().props;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState({});
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (flash?.success) {
            setSuccessMessage(flash.success);
            const timer = setTimeout(() => setSuccessMessage(''), 3000);
            return () => clearTimeout(timer);
        }

        if (flash?.error) {
            setErrors((prev) => ({ ...prev, general: flash.error }));
        }
    }, [flash]);

    const [showForgotModal, setShowForgotModal] = useState(false);
    const [forgotStep, setForgotStep] = useState(1);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotNewPassword, setForgotNewPassword] = useState('');
    const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotErrors, setForgotErrors] = useState({});
    const [forgotMessage, setForgotMessage] = useState('');
    const [otpExpiresIn, setOtpExpiresIn] = useState(0);
    const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
    const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);

    useEffect(() => {
        if (!showForgotModal || forgotStep !== 2) {
            return undefined;
        }

        const timer = setInterval(() => {
            setOtpExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);

        return () => clearInterval(timer);
    }, [showForgotModal, forgotStep]);

    // Diri i-reset ug sirado ang forgot password form.
    const resetForgotForm = () => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotEmail('');
        setForgotOtp('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');
        setForgotErrors({});
        setForgotMessage('');
        setOtpExpiresIn(0);
        setShowForgotNewPassword(false);
        setShowForgotConfirmPassword(false);
    };

    // Diri ablihan ang forgot password modal.
    const openForgotModal = () => {
        setForgotEmail(email);
        setForgotErrors({});
        setForgotMessage('');
        setOtpExpiresIn(0);
        setForgotStep(1);
        setShowForgotModal(true);
    };

    // Diri kuhaon ang error message gikan sa API.
    const extractApiError = (error, fallback = 'Something went wrong') => {
        const data = error.response?.data;
        if (data?.messages) {
            const first = Object.values(data.messages).flat()[0];
            if (first) return first;
        }
        return data?.error || error.message || fallback;
    };

    // Diri ipadala ang OTP sa email.
    const handleSendOtp = async () => {
        if (!forgotEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotEmail)) {
            setForgotErrors({ email: 'Please enter a valid email address' });
            return;
        }

        setForgotLoading(true);
        setForgotErrors({});
        setForgotMessage('');

        try {
            const response = await axios.post('/api/mobile/send-otp', {
                email: forgotEmail.trim().toLowerCase(),
                purpose: 'password_reset',
            });

            if (response.data.success) {
                const expiresIn = response.data.expires_in || DEFAULT_OTP_EXPIRY_SECONDS;
                setOtpExpiresIn(expiresIn);
                if (response.data.otp) {
                    setForgotMessage(`OTP: ${response.data.otp} (email delivery failed — check mail config)`);
                } else {
                    setForgotMessage('Check your email for the 6-digit verification code.');
                }
                setForgotStep(2);
            } else {
                setForgotErrors({ general: response.data.error || 'Failed to send OTP' });
            }
        } catch (error) {
            setForgotErrors({ general: extractApiError(error, 'Failed to send OTP') });
        } finally {
            setForgotLoading(false);
        }
    };

    // Diri i-verify ang OTP code.
    const handleVerifyOtp = async () => {
        if (otpExpiresIn <= 0) {
            setForgotErrors({ otp: 'This code has expired. Please resend a new one.' });
            return;
        }

        if (!forgotOtp || forgotOtp.length !== 6) {
            setForgotErrors({ otp: 'Please enter the 6-digit code' });
            return;
        }

        setForgotLoading(true);
        setForgotErrors({});
        setForgotMessage('');

        try {
            const response = await axios.post('/api/mobile/verify-otp', {
                email: forgotEmail.trim().toLowerCase(),
                code: forgotOtp,
                purpose: 'password_reset',
            });

            if (response.data.success) {
                setOtpExpiresIn(0);
                setForgotMessage('Code verified! Choose your new password below.');
                setForgotStep(3);
            } else {
                setForgotErrors({ otp: response.data.error || 'Invalid OTP' });
            }
        } catch (error) {
            setForgotErrors({ otp: extractApiError(error, 'Failed to verify OTP') });
        } finally {
            setForgotLoading(false);
        }
    };

    // Diri i-reset ang password.
    const handleResetPassword = async () => {
        const fieldErrors = {};
        if (!forgotNewPassword || forgotNewPassword.length < 8) {
            fieldErrors.password = 'Password must be at least 8 characters';
        }
        if (forgotNewPassword !== forgotConfirmPassword) {
            fieldErrors.password_confirmation = 'Passwords do not match';
        }

        if (Object.keys(fieldErrors).length > 0) {
            setForgotErrors(fieldErrors);
            return;
        }

        setForgotLoading(true);
        setForgotErrors({});
        setForgotMessage('');

        try {
            const response = await axios.post('/api/mobile/reset-password-otp', {
                email: forgotEmail.trim().toLowerCase(),
                code: forgotOtp,
                password: forgotNewPassword,
                password_confirmation: forgotConfirmPassword,
            });

            if (response.data.success) {
                setPassword(forgotNewPassword);
                setEmail(forgotEmail.trim().toLowerCase());
                resetForgotForm();
                setSuccessMessage('Password reset successfully! You can now sign in.');
                setTimeout(() => setSuccessMessage(''), 5000);
            } else {
                setForgotErrors({ general: response.data.error || 'Failed to reset password' });
            }
        } catch (error) {
            setForgotErrors({ general: extractApiError(error, 'Failed to reset password') });
        } finally {
            setForgotLoading(false);
        }
    };

    // Diri i-submit ang login.
    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);
        setErrors({});
        setSuccessMessage('');

        router.post('/admin/login', {
            email,
            password,
        }, {
            onFinish: () => setLoading(false),
            onError: (errors) => {
                setErrors(errors);
                if (errors.email) {
                    setErrors({ general: errors.email });
                }
            },
        });
    };

    return (
        <>
            <style>{`
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes alert-in {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .login-fade-in { animation: fade-in 0.8s ease-out; }
                .login-alert { animation: alert-in 0.3s ease-out; }
            `}</style>

            <div className="login-fade-in relative min-h-screen lg:h-screen lg:overflow-hidden">
                <img
                    src={LOGIN_BG_IMAGE}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="relative grid min-h-screen lg:h-screen lg:grid-cols-2">
                    <div className="hidden items-center justify-center px-12 py-16 lg:flex xl:px-16">
                        <div className="max-w-lg text-center text-navy-dark [text-shadow:0_0_10px_#fff,0_0_22px_#fff,0_1px_2px_#fff]">
                            <div className="flex items-center justify-center gap-5">
                                <img
                                    src="/images/el_salvador_city_vet_logo.png"
                                    alt="ES CityVet"
                                    className="h-20 w-20 rounded-full bg-white object-contain shadow-[0_10px_28px_rgba(0,0,0,0.55)] xl:h-24 xl:w-24"
                                />
                                <h1 className="text-5xl font-bold tracking-tight !text-navy-dark xl:text-6xl">
                                    ES CityVet
                                </h1>
                            </div>
                            <p className="mt-6 text-2xl font-semibold text-navy-dark xl:text-3xl">
                                El Salvador City Veterinary Office
                            </p>
                        </div>
                    </div>

                    <div className="flex min-h-screen items-center justify-center bg-canvas/40 px-6 py-10 backdrop-blur-sm sm:px-10 lg:min-h-0 lg:overflow-y-auto lg:px-14 xl:px-20">
                        <div className="w-full max-w-md">
                            <div className="mb-8 flex items-center gap-3 lg:hidden">
                                <img
                                    src="/images/el_salvador_city_vet_logo.png"
                                    alt="ES CityVet"
                                    className="h-11 w-11 rounded-full bg-white object-contain"
                                />
                                <div>
                                    <p className="text-sm font-bold text-navy">ES CityVet</p>
                                    <p className="text-xs font-medium text-teal">El Salvador City Veterinary Office</p>
                                </div>
                            </div>

                            <div className="mb-8">
                                <h2 className="text-3xl font-semibold text-navy">Staff Sign In</h2>
                                <p className="mt-2 text-sm font-medium text-navy-dark">Access your clinic dashboard</p>
                            </div>

                            {successMessage && (
                                <div className="login-alert relative mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-emerald-800">
                                    <div className="flex items-center justify-center gap-2 pr-6">
                                        <svg className="h-4 w-4 shrink-0 text-emerald-500" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                                        </svg>
                                        <span className="text-sm font-medium">{successMessage}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSuccessMessage('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-600"
                                    >
                                        ×
                                    </button>
                                </div>
                            )}

                            {errors.general && (
                                <div className="login-alert mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                                    </svg>
                                    <span className="flex-1 text-sm font-medium">{errors.general}</span>
                                    <button type="button" onClick={() => setErrors(prev => ({ ...prev, general: '' }))} className="text-red-300 hover:text-red-500">×</button>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label htmlFor="email" className="mb-2 block text-sm font-semibold text-navy">Email address</label>
                                    <input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className={`w-full rounded-lg border bg-white px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:ring-2 ${
                                            errors.email
                                                ? 'border-danger focus:ring-danger/20'
                                                : 'border-line focus:border-teal focus:ring-teal/20'
                                        }`}
                                        placeholder="you@example.com"
                                        required
                                    />
                                    {errors.email && <p className="mt-1.5 text-xs font-medium text-danger">{errors.email}</p>}
                                </div>

                                <div>
                                    <label htmlFor="password" className="mb-2 block text-sm font-semibold text-navy">Password</label>
                                    <div className="relative">
                                        <input
                                            id="password"
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            className={`w-full rounded-lg border bg-white px-4 py-3 pr-12 text-sm text-ink outline-none transition placeholder:text-muted focus:ring-2 ${
                                                errors.password
                                                    ? 'border-danger focus:ring-danger/20'
                                                    : 'border-line focus:border-teal focus:ring-teal/20'
                                            }`}
                                            placeholder="Enter your password"
                                            required
                                        />
                                        <PasswordToggleButton
                                            visible={showPassword}
                                            onToggle={() => setShowPassword(!showPassword)}
                                            iconClassName="text-muted hover:text-teal"
                                        />
                                    </div>
                                    {errors.password && <p className="mt-1.5 text-xs font-medium text-danger">{errors.password}</p>}
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <label className="flex cursor-pointer items-center gap-2.5">
                                        <input type="checkbox" className="h-4 w-4 rounded border-line text-teal focus:ring-teal/30" />
                                        <span className="text-sm text-ink">Keep me signed in</span>
                                    </label>
                                    <button
                                        type="button"
                                        onClick={openForgotModal}
                                        className="text-sm font-semibold text-teal transition hover:text-teal-dark"
                                    >
                                        Forgot?
                                    </button>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal py-3.5 text-sm font-semibold text-white transition hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loading ? (
                                        <>
                                            <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                            </svg>
                                            Logging in…
                                        </>
                                    ) : 'Sign In'}
                                </button>
                            </form>

                            <p className="mt-10 text-center text-xs font-medium text-navy-dark">
                                © 2026 ES CityVet · All rights reserved
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Forgot Password Modal */}
            {showForgotModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={resetForgotForm} />
                    <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl login-alert">
                        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 pb-4 pt-6">
                            <div className="flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-100 to-teal-200 shadow-sm">
                                    <svg className="h-5 w-5 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Reset Password</h3>
                                    <p className="text-xs text-gray-500">
                                        {forgotStep === 1 && 'Enter your email to receive a code'}
                                        {forgotStep === 2 && 'Enter the 6-digit code from your email'}
                                        {forgotStep === 3 && 'Choose a new password'}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={resetForgotForm}
                                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex shrink-0 items-center justify-center gap-2 border-b border-gray-50 px-6 py-4">
                            {['Email', 'Verify', 'Password'].map((label, index) => {
                                const stepNum = index + 1;
                                const active = forgotStep === stepNum;
                                const done = forgotStep > stepNum;
                                return (
                                    <div key={label} className="flex items-center gap-2">
                                        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                                            done ? 'bg-teal text-white' : active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-400'
                                        }`}>
                                            {done ? (
                                                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                </svg>
                                            ) : stepNum}
                                        </div>
                                        <span className={`text-xs font-medium ${active ? 'text-gray-900' : 'text-gray-400'}`}>{label}</span>
                                        {index < 2 && <div className={`mx-1 h-px w-6 ${done ? 'bg-teal' : 'bg-gray-200'}`} />}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                            {forgotMessage && (
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-800">
                                    {forgotMessage}
                                </div>
                            )}

                            {forgotErrors.general && (
                                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                                    {forgotErrors.general}
                                </div>
                            )}

                            {forgotStep === 1 && (
                                <div>
                                    <label htmlFor="forgot-email" className="mb-2 block text-sm font-semibold text-gray-900">Email address</label>
                                    <input
                                        id="forgot-email"
                                        type="email"
                                        value={forgotEmail}
                                        onChange={(e) => setForgotEmail(e.target.value)}
                                        className={`w-full rounded-xl border px-4 py-3 text-sm transition-all focus:outline-none focus:ring-2 ${
                                            forgotErrors.email
                                                ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-100'
                                                : 'border-gray-200 bg-gray-50/80 focus:border-violet-400 focus:bg-white focus:ring-violet-100'
                                        }`}
                                        placeholder="you@example.com"
                                        autoFocus
                                    />
                                    {forgotErrors.email && <p className="mt-1.5 text-xs font-medium text-red-500">{forgotErrors.email}</p>}
                                </div>
                            )}

                            {forgotStep === 2 && (
                                <div>
                                    <label htmlFor="forgot-otp" className="mb-2 block text-sm font-semibold text-gray-900">Verification code</label>
                                    <input
                                        id="forgot-otp"
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={6}
                                        value={forgotOtp}
                                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className={`w-full rounded-xl border px-4 py-3 text-center text-lg tracking-[0.4em] transition-all focus:outline-none focus:ring-2 ${
                                            forgotErrors.otp
                                                ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-100'
                                                : 'border-gray-200 bg-gray-50/80 focus:border-violet-400 focus:bg-white focus:ring-violet-100'
                                        }`}
                                        placeholder="000000"
                                        autoFocus
                                    />
                                    {forgotErrors.otp && <p className="mt-1.5 text-center text-xs font-medium text-red-500">{forgotErrors.otp}</p>}
                                    <div className="mt-4 flex flex-col items-center gap-2 text-center">
                                        {otpExpiresIn > 0 ? (
                                            <p className="text-sm font-medium text-gray-600">
                                                Code expires in{' '}
                                                <span className={`font-bold tabular-nums ${otpExpiresIn <= 60 ? 'text-red-600' : 'text-violet-600'}`}>
                                                    {formatOtpCountdown(otpExpiresIn)}
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="text-sm font-medium text-red-600">Code expired. Request a new one.</p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleSendOtp}
                                            disabled={forgotLoading}
                                            className="text-xs font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-50"
                                        >
                                            {otpExpiresIn > 0 ? "Didn't get it? Resend code" : 'Resend code'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {forgotStep === 3 && (
                                <>
                                    <div>
                                        <label htmlFor="forgot-new-password" className="mb-2 block text-sm font-semibold text-gray-900">New password</label>
                                        <div className="relative">
                                            <input
                                                id="forgot-new-password"
                                                type={showForgotNewPassword ? 'text' : 'password'}
                                                value={forgotNewPassword}
                                                onChange={(e) => setForgotNewPassword(e.target.value)}
                                                className={`w-full rounded-xl border px-4 py-3 pr-12 text-sm transition-all focus:outline-none focus:ring-2 ${
                                                    forgotErrors.password
                                                        ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-100'
                                                        : 'border-gray-200 bg-gray-50/80 focus:border-violet-400 focus:bg-white focus:ring-violet-100'
                                                }`}
                                                placeholder="Minimum 8 characters"
                                                autoFocus
                                            />
                                            <PasswordToggleButton
                                                visible={showForgotNewPassword}
                                                onToggle={() => setShowForgotNewPassword(!showForgotNewPassword)}
                                            />
                                        </div>
                                        {forgotErrors.password && <p className="mt-1.5 text-xs font-medium text-red-500">{forgotErrors.password}</p>}
                                    </div>
                                    <div>
                                        <label htmlFor="forgot-confirm-password" className="mb-2 block text-sm font-semibold text-gray-900">Confirm password</label>
                                        <div className="relative">
                                            <input
                                                id="forgot-confirm-password"
                                                type={showForgotConfirmPassword ? 'text' : 'password'}
                                                value={forgotConfirmPassword}
                                                onChange={(e) => setForgotConfirmPassword(e.target.value)}
                                                className={`w-full rounded-xl border px-4 py-3 pr-12 text-sm transition-all focus:outline-none focus:ring-2 ${
                                                    forgotErrors.password_confirmation
                                                        ? 'border-red-300 bg-red-50/50 focus:border-red-400 focus:ring-red-100'
                                                        : 'border-gray-200 bg-gray-50/80 focus:border-violet-400 focus:bg-white focus:ring-violet-100'
                                                }`}
                                                placeholder="Re-enter your password"
                                            />
                                            <PasswordToggleButton
                                                visible={showForgotConfirmPassword}
                                                onToggle={() => setShowForgotConfirmPassword(!showForgotConfirmPassword)}
                                            />
                                        </div>
                                        {forgotErrors.password_confirmation && (
                                            <p className="mt-1.5 text-xs font-medium text-red-500">{forgotErrors.password_confirmation}</p>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex shrink-0 gap-3 border-t border-gray-100 bg-white/95 px-6 py-4">
                            {forgotStep > 1 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setForgotStep((prev) => prev - 1);
                                        setForgotErrors({});
                                        setForgotMessage('');
                                        setOtpExpiresIn(0);
                                    }}
                                    disabled={forgotLoading}
                                    className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50"
                                >
                                    Back
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={forgotStep === 1 ? handleSendOtp : forgotStep === 2 ? handleVerifyOtp : handleResetPassword}
                                disabled={forgotLoading || (forgotStep === 2 && otpExpiresIn <= 0)}
                                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-dark disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {forgotLoading ? (
                                    <>
                                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Please wait…
                                    </>
                                ) : forgotStep === 1 ? 'Send Code' : forgotStep === 2 ? 'Verify Code' : 'Reset Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
