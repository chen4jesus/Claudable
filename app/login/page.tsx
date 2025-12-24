"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import Image from 'next/image';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json();
        setError(data.error || 'Invalid credentials');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fdfdfd] overflow-hidden relative">
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20"
          style={{ background: 'radial-gradient(circle, #D97757 0%, transparent 70%)' }}
        />
        <div 
          className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20"
          style={{ background: 'radial-gradient(circle, #5777D9 0%, transparent 70%)' }}
        />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md p-8 bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] border border-white/50 relative z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="relative w-24 h-24 mb-2 group">
            {/* Logo image */}
            <Image 
              src="/faithconnect_blue.png" 
              alt="FaithConnect" 
              width={96} 
              height={96}
              className="relative z-10 drop-shadow-md transition-transform duration-300 group-hover:scale-105 rounded-2xl"
              priority
            />
            {/* Shine effect overlay - appears on hover */}
            <div 
              className="absolute inset-0 z-20 overflow-hidden rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{
                background: 'linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.8) 50%, transparent 70%)',
                backgroundSize: '200% 100%',
                animation: 'shine 1.5s ease-in-out infinite'
              }}
            />
          </div>
          <style jsx>{`
            @keyframes shine {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Build Faithfully</h1>
          <p className="text-gray-500 mt-2">Sign in to your workspace</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 ml-1">Username</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[#D97757] transition-colors">
                <User size={18} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-11 pr-4 py-3 bg-gray-50/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757] outline-none transition-all placeholder:text-gray-400"
                placeholder="root"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 ml-1">Password</label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-[#D97757] transition-colors">
                <Lock size={18} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full pl-11 pr-12 py-3 bg-gray-50/50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-[#D97757]/20 focus:border-[#D97757] outline-none transition-all placeholder:text-gray-400"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-[#D97757] to-[#BF5B3D] text-white rounded-2xl font-semibold shadow-lg shadow-[#D97757]/25 hover:shadow-xl hover:shadow-[#D97757]/30 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-70 disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Sign In'}
          </button>
        </form>

        <p className="mt-8 text-center text-gray-500 text-xs">
          Build by Faith &middot; Build Faithfully
        </p>
      </motion.div>
    </div>
  );
}
