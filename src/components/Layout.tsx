import React from 'react';
import { UserProfile } from '../types';
import { Button } from './ui/button';
import { LogOut, User, Bell, LayoutDashboard, Settings } from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { UserProfileSettings } from './UserProfileSettings';

interface LayoutProps {
  user: UserProfile;
  onLogout: () => void;
  onUserUpdate: (updatedUser: UserProfile) => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, onUserUpdate, children }: LayoutProps) {
  const [isProfileOpen, setIsProfileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-bottom border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-primary p-2 rounded-lg">
              <LayoutDashboard className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 hidden sm:block">ERP Expense Pro</h1>
          </div>

          <div className="flex items-center gap-4">
            <NotificationCenter userId={user.uid} />
            
            <div className="h-8 w-[1px] bg-slate-200 mx-2" />

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500 capitalize">{user.role}</p>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger className="bg-slate-100 p-2 rounded-full hover:bg-slate-200 transition-colors flex items-center justify-center">
                  {user.photoUrl ? (
                    <img src={user.photoUrl} alt={user.name} className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <User className="w-5 h-5 text-slate-600" />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setIsProfileOpen(true)}>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Profile Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onLogout} className="text-red-600">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      <Dialog open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Profile Settings</DialogTitle>
          </DialogHeader>
          <UserProfileSettings 
            user={user} 
            onUpdate={(updated) => {
              onUserUpdate(updated);
              setIsProfileOpen(false);
            }} 
          />
        </DialogContent>
      </Dialog>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      <footer className="bg-white border-top border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-500 text-sm">
          &copy; {new Date().getFullYear()} ERP Expense Pro. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
