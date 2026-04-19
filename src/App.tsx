/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from './types';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { toast } from 'sonner';
import { Layout } from './components/Layout';
import { ExpenseDashboard } from './components/ExpenseDashboard';
import { Loader2, ShieldAlert, Mail, Lock } from 'lucide-react';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isSystemLogin, setIsSystemLogin] = useState(false);

  useEffect(() => {
    // Check for system login in localStorage
    const savedUser = localStorage.getItem('erp_system_user');
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      // Verify the user still exists in Firestore using their UID or Email
      const userId = parsedUser.uid || parsedUser.email;
      getDoc(doc(db, 'users', userId)).then(docSnap => {
        if (docSnap.exists()) {
          setUser(parsedUser);
        } else {
          localStorage.removeItem('erp_system_user');
          setUser(null);
          toast.error('Session expired or account deleted');
        }
        setLoading(false);
      }).catch(() => {
        // Fallback to local data if offline
        setUser(parsedUser);
        setLoading(false);
      });
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setError(null);
      if (firebaseUser) {
        try {
          // 1. Try finding by UID
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          let userData: UserProfile | null = null;

          if (userDoc.exists()) {
            userData = userDoc.data() as UserProfile;
            
            // Force admin role for bootstrap email if it's not set
            if (firebaseUser.email?.toLowerCase() === "kumarpranab870@gmail.com" && userData.role !== 'admin') {
              userData.role = 'admin';
              await updateDoc(doc(db, 'users', firebaseUser.uid), { role: 'admin' });
            }
            setUser(userData);
          } else {
            // 2. Try finding by Email (pre-registered by admin)
            const email = firebaseUser.email?.toLowerCase();
            if (email) {
              const q = query(collection(db, 'users'), where('email', '==', email));
              const querySnapshot = await getDocs(q);
              
              if (!querySnapshot.empty) {
                const existingDoc = querySnapshot.docs[0];
                const preRegisteredData = existingDoc.data() as UserProfile;
                
                // Link the UID to this profile
                const updatedUser = { ...preRegisteredData, uid: firebaseUser.uid };
                
                // Update the document with the actual UID as ID
                await setDoc(doc(db, 'users', firebaseUser.uid), updatedUser);
                setUser(updatedUser);
              } else if (email === "kumarpranab870@gmail.com") {
                // 3. Bootstrap admin
                const newUser: UserProfile = {
                  uid: firebaseUser.uid,
                  email: email,
                  name: firebaseUser.displayName || 'Admin',
                  role: 'admin',
                };
                await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
                setUser(newUser);
              } else {
                setError('Your account is not registered. Please contact an administrator.');
                await signOut(auth);
              }
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Logged in successfully');
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to login');
    }
  };

  const handleSystemLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const email = loginForm.email.toLowerCase();
      // Use getDoc instead of query to allow more restrictive rules
      const userDoc = await getDoc(doc(db, 'users', email));
      
      if (userDoc.exists()) {
        const userData = userDoc.data() as UserProfile;
        if (userData.password === loginForm.password) {
          setUser(userData);
          localStorage.setItem('erp_system_user', JSON.stringify(userData));
          toast.success('Logged in successfully');
        } else {
          setError('Invalid password');
        }
      } else {
        setError('User not found');
      }
    } catch (error) {
      console.error('System login error:', error);
      toast.error('Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('erp_system_user');
      setUser(null);
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error('Failed to logout');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">ERP Expense Pro</h1>
            <p className="text-slate-600">Streamline your company's expense management.</p>
          </div>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg flex items-start gap-3 text-left">
              <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            <form onSubmit={handleSystemLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="name@company.com"
                    className="pl-10"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    className="pl-10"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    required
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200"></span>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-slate-500">Or continue with</span>
              </div>
            </div>

            <Button variant="outline" onClick={handleLogin} className="w-full h-11">
              Google Account
            </Button>
          </div>
        </div>
        <Toaster />
      </div>
    );
  }

  return (
    <Layout user={user} onLogout={handleLogout} onUserUpdate={(updatedUser) => setUser(updatedUser)}>
      <ExpenseDashboard user={user} onUserUpdate={(updatedUser) => setUser(updatedUser)} />
      <Toaster />
    </Layout>
  );
}

