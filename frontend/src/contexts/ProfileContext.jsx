import React, { createContext, useContext, useState, useEffect } from 'react';
import { getProfile } from '../services/api';

const ProfileContext = createContext();

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within ProfileProvider');
  }
  return context;
};

export const ProfileProvider = ({ children }) => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Try to load profile from localStorage on mount
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const savedEmail = localStorage.getItem('userEmail');
        
        if (savedEmail) {
          const data = await getProfile(savedEmail);
          setProfile(data.profile);
          setLoading(false);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        setError(err);
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const saveProfile = (profileData) => {
    setProfile(profileData);
    if (profileData?.email) {
      localStorage.setItem('userEmail', profileData.email);
    }
  };

  const logout = () => {
    setProfile(null);
    localStorage.removeItem('userEmail');
  };

  const value = {
    profile,
    loading,
    error,
    saveProfile,
    logout,
    isAuthenticated: !!profile
  };

  return (
    <ProfileContext.Provider value={value}>
      {children}
    </ProfileContext.Provider>
  );
};

export default ProfileContext;
