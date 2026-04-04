import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, onSnapshot, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  authError: string | null;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  registerWithEmail: (email: string, pass: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setUser(currentUser);
      setProfile(null);
      setLoading(true);

      const profileRef = doc(db, 'users', currentUser.uid);
      try {
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          setProfile(profileSnap.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            email: currentUser.email || '',
            role: (currentUser.email === 'jabpa87@gmail.com' || currentUser.email === 'bobychampion87@gmail.com') ? 'admin' : 'applicant',
            displayName: currentUser.displayName || 'New User'
          };
          await setDoc(profileRef, newProfile);
          setProfile(newProfile);
        }
      } catch (error) {
        console.error('Failed to load user profile:', error);
        try {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        } catch {
          /* handleFirestoreError rethrows after logging */
        }
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    setAuthError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error.code === 'auth/configuration-not-found') {
        setAuthError('Google Sign-In is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable Google.');
      } else if (error.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setAuthError(`This domain (${domain}) is not authorized in your Firebase Console. Please go to Authentication > Settings > Authorized domains and add "${domain}" to the list.`);
      } else {
        setAuthError(error.message || 'An unexpected error occurred during login.');
      }
    }
  };

  const loginWithEmail = async (email: string, pass: string) => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error: any) {
      console.error('Email login failed:', error);
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setAuthError('Invalid email or password. If you haven\'t created an account yet, please use the "Register now" link below.');
      } else if (error.code === 'auth/configuration-not-found') {
        setAuthError('Email/Password authentication is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable Email/Password.');
      } else {
        setAuthError(error.message || 'An unexpected error occurred during login.');
      }
    }
  };

  const registerWithEmail = async (email: string, pass: string, name: string) => {
    setAuthError(null);
    try {
      const result = await createUserWithEmailAndPassword(auth, email, pass);
      const profileRef = doc(db, 'users', result.user.uid);
      const newProfile: UserProfile = {
        uid: result.user.uid,
        email: email,
        role: (email === 'jabpa87@gmail.com' || email === 'bobychampion87@gmail.com') ? 'admin' : 'applicant',
        displayName: name
      };
      await setDoc(profileRef, newProfile);
      setProfile(newProfile);
    } catch (error: any) {
      console.error('Registration failed:', error);
      if (error.code === 'auth/email-already-in-use') {
        setAuthError('This email is already in use. Please try logging in instead.');
      } else {
        setAuthError(error.message || 'An unexpected error occurred during registration.');
      }
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const clearError = () => setAuthError(null);

  const isAdmin = profile?.role !== 'teacher' && profile?.role !== 'parent' && profile?.role !== 'applicant' && (
                  profile?.role === 'admin' || 
                  profile?.role === 'School_admin' || 
                  user?.email === 'jabpa87@gmail.com' ||
                  user?.email === 'bobychampion87@gmail.com'
                );

  return (
    <AuthContext.Provider value={{ user, profile, loading, isAdmin, authError, login, loginWithEmail, registerWithEmail, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within a FirebaseProvider');
  }
  return context;
}
