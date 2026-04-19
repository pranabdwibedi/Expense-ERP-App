import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, setDoc, orderBy, deleteDoc, getDocs, where } from 'firebase/firestore';
import { UserProfile, UserRole } from '../types';
import { UserProfileSettings } from './UserProfileSettings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { toast } from 'sonner';
import { Loader2, UserPlus, Users, Trash2, AlertCircle, Search, Edit2, X } from 'lucide-react';

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [userToEdit, setUserToEdit] = useState<UserProfile | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'employee' as UserRole,
    managerId: '',
    password: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
      // Deduplicate by email to prevent duplicate key errors
      const uniqueUsers = data.reduce((acc: UserProfile[], current) => {
        const x = acc.find(item => 
          item.email && current.email && 
          item.email.toLowerCase() === current.email.toLowerCase()
        );
        if (!x) {
          return acc.concat([current]);
        } else {
          return acc;
        }
      }, []);
      setUsers(uniqueUsers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => unsubscribe();
  }, []);

  const filteredUsers = users.filter(u => 
    (u.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) || 
    (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const managers = users.filter(u => u.role === 'manager' || u.role === 'ceo' || u.role === 'admin');
  const ceoExists = users.some(u => u.role === 'ceo');

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    
    const email = userToDelete;
    if (email?.toLowerCase() === 'kumarpranab870@gmail.com') {
      toast.error('Cannot delete the bootstrap admin account');
      setIsDeleteConfirmOpen(false);
      return;
    }

    setLoading(true);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email?.toLowerCase()));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        for (const d of snapshot.docs) {
          await deleteDoc(doc(db, 'users', d.id));
        }
        toast.success('User deleted successfully');
      } else {
        toast.error('User document not found');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${email}`);
    } finally {
      setLoading(false);
      setIsDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  };

  const handleClearAllUsers = async () => {
    setClearing(true);
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      
      let deletedCount = 0;
      for (const d of snapshot.docs) {
        const userData = d.data() as UserProfile;
        if (userData.email?.toLowerCase() !== 'kumarpranab870@gmail.com') {
          await deleteDoc(doc(db, 'users', d.id));
          deletedCount++;
        }
      }
      
      toast.success(`Successfully deleted ${deletedCount} users`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'users');
    } finally {
      setClearing(false);
      setIsClearAllConfirmOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.name || !formData.role || !formData.password) {
      toast.error('Please fill in all required fields including password');
      return;
    }

    if (formData.role === 'employee' && !formData.managerId) {
      toast.error('Manager is mandatory for employees');
      return;
    }

    if (formData.role === 'ceo' && ceoExists) {
      toast.error('A CEO already exists in the system');
      return;
    }

    setLoading(true);
    try {
      // In a real app, you'd use Firebase Admin SDK or a Cloud Function to create the user in Auth.
      // For this demo, we'll use the email as a temporary UID or expect the user to sign in with this email.
      // We'll use a deterministic UID based on email for the profile if the user hasn't signed in yet,
      // but Firebase Auth UIDs are random. 
      // A better way for this environment is to store the profile by email and then link it on first login,
      // or just use the email as the document ID.
      
      // Let's use email as the document ID for simplicity in this restricted environment,
      // but the App.tsx expects doc(db, 'users', firebaseUser.uid).
      // So we'll have to wait for the user to sign in to get their UID, OR
      // we can have a 'pending_users' collection and link them.
      
      // Actually, the user wants the admin to "add" them. 
      // I'll create the user document using a placeholder ID (like the email) and update App.tsx to find by email if UID doesn't match.
      // Better: Create the document with a random ID and store the email. App.tsx will query by email.
      
      const newUser: any = {
        uid: formData.email.toLowerCase(),
        email: formData.email.toLowerCase(),
        name: formData.name,
        role: formData.role,
      };

      if (formData.managerId) newUser.managerId = formData.managerId;
      if (formData.password) newUser.password = formData.password;

      await setDoc(doc(db, 'users', newUser.email), newUser);
      
      toast.success('User added successfully. They can now sign in with this email and password.');
      setFormData({ email: '', name: '', role: 'employee', managerId: '', password: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add New User
          </CardTitle>
          <CardDescription>Register a new employee, manager, or executive.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                placeholder="John Doe"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="john@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: UserRole) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger id="role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  {!ceoExists && <SelectItem value="ceo">CEO</SelectItem>}
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manager">Manager {formData.role === 'employee' && <span className="text-red-500">*</span>}</Label>
              <Select
                value={formData.managerId}
                onValueChange={(value) => setFormData({ ...formData, managerId: value })}
                disabled={formData.role === 'ceo' || formData.role === 'admin'}
              >
                <SelectTrigger id="manager">
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  {managers.map(m => (
                    <SelectItem key={m.uid || m.email} value={m.uid || m.email}>{m.name} ({m.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Login Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
              Add User
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              System Users
            </CardTitle>
            <CardDescription>Manage existing users and their roles.</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search users..." 
                className="pl-10 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={() => setIsClearAllConfirmOpen(true)}
              disabled={clearing}
              className="flex items-center gap-2"
            >
              {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
              Clear All Users (Except Admin)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/50">
                <TableHead className="w-[150px]">Name</TableHead>
                <TableHead className="w-[200px]">Email</TableHead>
                <TableHead className="w-[120px]">Role</TableHead>
                <TableHead className="w-[150px]">Manager</TableHead>
                <TableHead className="text-right w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((u) => (
                <TableRow key={`${u.email}-${u.uid}`} className="hover:bg-slate-50/10">
                  <TableCell className="font-medium whitespace-nowrap">{u.name}</TableCell>
                  <TableCell className="text-slate-500">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize text-[10px] font-medium">{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.managerId ? users.find(m => m.uid === u.managerId || m.email === u.managerId)?.name || 'Unknown' : '-'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setUserToEdit(u)}
                        className="text-slate-500 hover:text-primary hover:bg-primary/5"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      {u.email?.toLowerCase() !== 'kumarpranab870@gmail.com' && (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            setUserToDelete(u.email);
                            setIsDeleteConfirmOpen(true);
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      </Card>

      <Dialog open={!!userToEdit} onOpenChange={(open) => !open && setUserToEdit(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User: {userToEdit?.name}</DialogTitle>
            <DialogDescription>
              Update profile details and security settings for this user.
            </DialogDescription>
          </DialogHeader>
          {userToEdit && (
            <UserProfileSettings 
              user={userToEdit} 
              onUpdate={(updated) => {
                setUsers(prev => prev.map(u => u.uid === updated.uid ? updated : u));
                setUserToEdit(null);
              }}
              isAdminEditingOthers={true}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the account for <strong>{userToDelete}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isClearAllConfirmOpen} onOpenChange={setIsClearAllConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear All Users</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>ALL</strong> users except your admin account? This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClearAllConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearAllUsers} disabled={clearing}>
              {clearing && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Clear All Users
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
