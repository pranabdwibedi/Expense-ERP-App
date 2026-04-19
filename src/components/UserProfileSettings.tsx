import React, { useState, useRef } from 'react';
import { UserProfile } from '../types';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, addDoc, serverTimestamp, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { toast } from 'sonner';
import { Loader2, Camera, Save, Lock, User, ShieldCheck, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';

interface UserProfileSettingsProps {
  user: UserProfile;
  onUpdate: (updatedUser: UserProfile) => void;
  isAdminEditingOthers?: boolean;
}

type PasswordStep = 'idle' | 'verify' | 'admin_disclaimer' | 'new';

export function UserProfileSettings({ user, onUpdate, isAdminEditingOthers = false }: UserProfileSettingsProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [passwordStep, setPasswordStep] = useState<PasswordStep>('idle');
  
  const [formData, setFormData] = useState({
    name: user.name || '',
    bio: user.bio || '',
    department: user.department || '',
    phone: user.phone || '',
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Basic validation
      if (file.size > 2 * 1024 * 1024) {
        toast.error('File size must be less than 2MB');
        return;
      }

      setUploading(true);
      try {
        // Use a safe path for storage
        const safeUid = user.uid.replace(/[^a-zA-Z0-9]/g, '_');
        const storageRef = ref(storage, `profiles/${safeUid}/${Date.now()}_${file.name}`);
        
        const uploadResult = await uploadBytes(storageRef, file);
        const photoUrl = await getDownloadURL(uploadResult.ref);
        
        await setDoc(doc(db, 'users', user.uid), { photoUrl }, { merge: true });
        onUpdate({ ...user, photoUrl });
        toast.success('Profile photo updated');
      } catch (error: any) {
        console.error('Upload error:', error);
        toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleVerifyOldPassword = () => {
    if (formData.oldPassword === user.password) {
      setPasswordStep('new');
    } else {
      toast.error('Incorrect current password');
    }
  };

  const handlePasswordUpdate = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (formData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        password: formData.newPassword
      });
      
      onUpdate({ ...user, password: formData.newPassword });

      // Notify admin if employee changes password
      if (!isAdminEditingOthers && user.role !== 'admin') {
        const adminQ = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminSnapshot = await getDocs(adminQ);
        const notificationPromises = adminSnapshot.docs.map(adminDoc => 
          addDoc(collection(db, 'notifications'), {
            userId: adminDoc.id,
            message: `Security Alert: ${user.name} has changed their password.`,
            read: false,
            createdAt: serverTimestamp(),
          })
        );
        await Promise.all(notificationPromises);
      }

      toast.success('Password updated successfully');
      setPasswordStep('idle');
      setFormData(prev => ({ ...prev, oldPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const updates: any = {
        name: formData.name,
        bio: formData.bio,
        department: formData.department,
        phone: formData.phone,
      };
      
      // Use setDoc with merge: true instead of updateDoc to be more resilient
      // if the document was deleted or ID mismatch occurred
      await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
      onUpdate({ ...user, ...updates });
      toast.success('Profile updated successfully');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Profile Photo</CardTitle>
          <CardDescription>Update your public avatar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-100 border-4 border-white shadow-lg">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <User className="w-16 h-16" />
                </div>
              )}
            </div>
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            </button>
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handlePhotoUpload} 
              className="hidden" 
              accept="image/*" 
            />
          </div>
          <div className="text-center">
            <h3 className="font-bold text-lg">{user.name}</h3>
            <p className="text-sm text-slate-500 capitalize">{user.role}</p>
            <p className="text-xs text-slate-400 mt-1">{user.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Update your bio and contact details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input 
                  id="name" 
                  value={formData.name} 
                  onChange={(e) => setFormData({...formData, name: e.target.value})} 
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input 
                  id="phone" 
                  value={formData.phone} 
                  onChange={(e) => setFormData({...formData, phone: e.target.value})} 
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Lock className="w-4 h-4" />
                Security Settings
              </h3>
              
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                      <KeyRound className="w-5 h-5 text-slate-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Account Password</p>
                      <p className="text-xs text-slate-500">Last changed recently</p>
                    </div>
                  </div>
                  <Button 
                    type="button"
                    variant="outline" 
                    size="sm"
                    onClick={() => setPasswordStep(isAdminEditingOthers ? 'admin_disclaimer' : 'verify')}
                    className="bg-white"
                  >
                    Change Password
                  </Button>
                </div>
              </div>
            </div>

            <Dialog open={passwordStep !== 'idle'} onOpenChange={(open) => !open && setPasswordStep('idle')}>
              <DialogContent className="sm:max-w-md">
                {passwordStep === 'verify' && (
                  <>
                    <DialogHeader>
                      <DialogTitle>Verify Identity</DialogTitle>
                      <DialogDescription>
                        Please enter your current password to continue.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="oldPassword">Current Password</Label>
                        <Input 
                          id="oldPassword" 
                          type="password" 
                          placeholder="••••••••"
                          value={formData.oldPassword} 
                          onChange={(e) => setFormData({...formData, oldPassword: e.target.value})} 
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPasswordStep('idle')}>Cancel</Button>
                      <Button onClick={handleVerifyOldPassword}>Continue</Button>
                    </DialogFooter>
                  </>
                )}

                {passwordStep === 'admin_disclaimer' && (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-amber-600">
                        <AlertTriangle className="w-5 h-5" />
                        Admin Disclaimer
                      </DialogTitle>
                      <DialogDescription className="pt-2">
                        You are about to change the password for <strong>{user.name}</strong>. 
                        This action will override their current login credentials. 
                        Please ensure you have authorization and inform the user of their new password.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                      <Button variant="outline" onClick={() => setPasswordStep('idle')}>Cancel</Button>
                      <Button variant="destructive" onClick={() => setPasswordStep('new')}>
                        I Understand, Continue
                      </Button>
                    </DialogFooter>
                  </>
                )}

                {passwordStep === 'new' && (
                  <>
                    <DialogHeader>
                      <DialogTitle>Set New Password</DialogTitle>
                      <DialogDescription>
                        Enter a strong password to secure the account.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input 
                          id="newPassword" 
                          type="password" 
                          placeholder="••••••••"
                          value={formData.newPassword} 
                          onChange={(e) => setFormData({...formData, newPassword: e.target.value})} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="confirmPassword">Confirm New Password</Label>
                        <Input 
                          id="confirmPassword" 
                          type="password" 
                          placeholder="••••••••"
                          value={formData.confirmPassword} 
                          onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} 
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPasswordStep('idle')}>Cancel</Button>
                      <Button onClick={handlePasswordUpdate} disabled={loading}>
                        {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                        Update Password
                      </Button>
                    </DialogFooter>
                  </>
                )}
              </DialogContent>
            </Dialog>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea 
                id="bio" 
                rows={4} 
                placeholder="Tell us about yourself..."
                value={formData.bio} 
                onChange={(e) => setFormData({...formData, bio: e.target.value})} 
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
