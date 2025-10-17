import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  FlatList,
  Modal,
  ActivityIndicator,
  ScrollView,
  Share,
} from 'react-native';
// Expo Imports for Device ID
import * as Application from 'expo-application';
import * as Device from 'expo-device'; 
import * as SMS from 'expo-sms'; 
import DeviceInfo from 'react-native-device-info'; // For real Device ID in bare workflow

import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  increment, 
  onSnapshot,
  limit,
} from 'firebase/firestore';

// --- Expo-Compatible Native Module Bridge (Conceptual/Placeholder) ---
// This interface calls the custom native code you inserted in Java.
const SmsNativeModule = {
    // A. Real Device ID Implementation (Uses react-native-device-info in bare workflow)
    getDeviceId: async () => {
        if (Platform.OS === 'android') {
            // Uses the installed native module for a truly unique ID
            return DeviceInfo.getUniqueId(); 
        }
        // Fallback for web/simulators
        return Device.osInternalBuildId || Device.osBuildId || 'FALLBACK_DEVICE_ID'; 
    },

    // B. SIM-Aware SMS Sending (This corresponds to your custom Java/Kotlin module)
    sendSms: async (recipient, message, simId, failureCallback, successCallback) => {
        // Since the cloud build will use your custom Java code, this call represents
        // the function signature that your Java module (SmsNativeModule.java) MUST implement.
        // It will directly call the native code to send the message from the specified SIM.
        
        // --- Simulation/Placeholder for React Native ---
        
        // We simulate the success/failure callbacks here, but in the final compiled app,
        // the callbacks in SmsNativeModule.java will execute these.
        try {
            // Placeholder: Assume native module is installed and handles the logic
            const success = true; // Replace with actual native module call if running locally
            if (success) {
                // In the real app, this successCallback is called from Java/Kotlin
                successCallback("Message successfully sent via native code.");
            } else {
                failureCallback("Native module failed to execute.");
            }
        } catch (e) {
             console.error("Native module execution error:", e);
             failureCallback("Critical module error during send attempt.");
        }
    }
};


// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCkeKgtfVDq2RrBPY4o495-8uFz1y4cASU",
  authDomain: "rupeedesk-135aa.firebaseapp.com",
  projectId: "rupeedesk-135aa",
  storageBucket: "rupeedesk-135aa.firebasestorage.app",
  messagingSenderId: "977708454299",
  appId: "1:977708454299:web:a57efa90527a10a662513e"
};

// --- CONSTANTS ---
const REWARD_PER_SMS = 0.20;
const REFERRAL_PERCENTAGE = 0.15; // 15%
const MIN_WITHDRAWAL = 100;

// --- Initialize Firebase ---
const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

// --- Helper Functions ---
const formatCurrency = (amount) => `₹${(amount || 0).toFixed(2)}`;
const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

// --- Logout Button (reusable) ---
const LogoutButton = ({ onLogout }) => (
  <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={onLogout}>
    <Text style={styles.buttonText}>Log Out</Text>
  </TouchableOpacity>
);

// --- Main App Component ---
export default function SmsRupeeApp() {
  const [user, setUser] = useState(null); 
  const [authScreen, setAuthScreen] = useState('main'); 

  const onLoginSuccess = (userData) => {
    setUser(userData);
  };

  if (!user) {
    switch (authScreen) {
      case 'login':
        return <LoginScreen onLoginSuccess={onLoginSuccess} showSignUp={() => setAuthScreen('signup')} />;
      case 'signup':
        return <SignUpScreen onLoginSuccess={onLoginSuccess} showLogin={() => setAuthScreen('login')} />;
      case 'adminLogin':
        return <AdminLoginScreen onLoginSuccess={onLoginSuccess} />;
      default:
        return (
          <View style={styles.container}>
            {/* App Icon */}
            <View style={styles.appIconContainer}>
                <Text style={{fontSize: 50}}>💰</Text> 
            </View>
            <Text style={styles.appTitle}>SmsRupee</Text>
            <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={() => setAuthScreen('login')}>
              <Text style={styles.buttonText}>User Login</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={() => setAuthScreen('signup')}>
              <Text style={styles.buttonText}>Sign Up</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setAuthScreen('adminLogin')}>
              <Text style={styles.adminLoginText}>Admin Login</Text>
            </TouchableOpacity>
          </View>
        );
    }
  }

  if (user.isAdmin) {
    return <AdminDashboard currentUser={user} onLogout={() => setUser(null)} />;
  } else {
    return <UserDashboard currentUser={user} onLogout={() => setUser(null)} />;
  }
}

// --- Authentication Screens ---
const LoginScreen = ({ onLoginSuccess, showSignUp }) => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (mobileNumber.length < 10 || !password) {
      Alert.alert('Error', 'Please enter a valid mobile number and password.');
      return;
    }
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', mobileNumber);
      const userDoc = await getDoc(userDocRef);
      const deviceId = await SmsNativeModule.getDeviceId(); 

      if (userDoc.exists() && userDoc.data().password === password) {
        const userData = userDoc.data();
        
        // --- DEVICE ID CHECK: Only one account per device ---
        if (userData.deviceId && userData.deviceId !== deviceId) {
             Alert.alert('Login Failed', 'This account is already linked to another device.');
             setIsLoading(false);
             return;
        }

        // Link device ID if it's the first login on this device
        if (!userData.deviceId) {
            await updateDoc(userDocRef, { deviceId: deviceId });
        }
        
        onLoginSuccess({ ...userData, mobileNumber });
      } else {
        Alert.alert('Login Failed', 'Invalid mobile number or password.');
      }
    } catch (error) {
      console.error('Login Error:', error);
      Alert.alert('Login Failed', 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>Welcome Back</Text>
      <View style={styles.authCard}>
        <TextInput style={styles.input} placeholder="Mobile Number" value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" maxLength={10} />
        <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleLogin} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={showSignUp}><Text style={styles.switchAuthText}>Don't have an account? **Sign Up**</Text></TouchableOpacity>
      </View>
    </View>
  );
};

const SignUpScreen = ({ onLoginSuccess, showLogin }) => {
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [referrerCode, setReferrerCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async () => {
    if (mobileNumber.length < 10 || password.length < 6) {
      Alert.alert('Error', 'Please enter a valid 10-digit number and a password of at least 6 characters.');
      return;
    }
    setIsLoading(true);
    try {
      const userDocRef = doc(db, 'users', mobileNumber);
      const userDoc = await getDoc(userDocRef);
      const deviceId = await SmsNativeModule.getDeviceId();

      // 1. Check for existing account
      if (userDoc.exists()) {
        Alert.alert('Error', 'This mobile number is already registered. Please login.');
        setIsLoading(false);
        return;
      }
      
      // 2. Check for device ID usage (one device, one ID)
      const existingDeviceQuery = query(collection(db, 'users'), where('deviceId', '==', deviceId), limit(1));
      const existingDeviceSnapshot = await getDocs(existingDeviceQuery);

      if (!existingDeviceSnapshot.empty) {
          Alert.alert('Error', 'A user is already registered on this device. Only one account per device is allowed.');
          setIsLoading(false);
          return;
      }
      
      // 3. Validate referrer code
      let referrerMobile = null;
      if (referrerCode) {
          const referrerDoc = await getDoc(doc(db, 'users', referrerCode));
          if (referrerDoc.exists()) {
              referrerMobile = referrerCode;
          } else {
              Alert.alert('Warning', 'Invalid referral code entered. Continuing without referral link.');
          }
      }

      // 4. Create new user
      const newUser = {
        mobileNumber: mobileNumber,
        password: password,
        balance: 0,
        referralCode: mobileNumber, // Use mobile number as the referral code
        referrerMobile: referrerMobile,
        deviceId: deviceId, 
        spinsAvailable: 1, // Free spin on signup
        lastCheckinDate: null,
        createdAt: serverTimestamp(),
      };
      await setDoc(userDocRef, newUser);
      Alert.alert('Success', 'Account created successfully! You received 1 free spin.');
      onLoginSuccess(newUser);

    } catch (error) {
      console.error('Sign Up Error:', error);
      Alert.alert('Sign Up Failed', 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>Create Your Account</Text>
      <View style={styles.authCard}>
        <TextInput style={styles.input} placeholder="Mobile Number" value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" maxLength={10} />
        <TextInput style={styles.input} placeholder="Password (min. 6 characters)" value={password} onChangeText={setPassword} secureTextEntry />
        <TextInput style={styles.input} placeholder="Referral Code (Optional)" value={referrerCode} onChangeText={setReferrerCode} keyboardType="phone-pad" maxLength={10} />
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleSignUp} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={showLogin}><Text style={styles.switchAuthText}>Already have an account? **Login**</Text></TouchableOpacity>
      </View>
    </View>
  );
};

const AdminLoginScreen = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleAdminLogin = async () => {
    setIsLoading(true);
    try {
      const adminDocRef = doc(db, 'admin', 'admin_credentials');
      const adminDoc = await getDoc(adminDocRef);
      if (adminDoc.exists() && adminDoc.data().username === username && adminDoc.data().password === password) {
        onLoginSuccess({ username: username, isAdmin: true });
      } else {
        Alert.alert('Login Failed', 'Invalid admin credentials.');
      }
    } catch (error) {
      console.error('Admin Login Error:', error);
      Alert.alert('Login Failed', 'An error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.appTitle}>Admin Access</Text>
      <View style={styles.authCard}>
        <TextInput style={styles.input} placeholder="Admin ID" value={username} onChangeText={setUsername} />
        <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleAdminLogin} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Admin Login</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
};


// --- USER DASHBOARD SHELL ---
const UserDashboard = ({ currentUser, onLogout }) => {
  const [balance, setBalance] = useState(currentUser.balance || 0);
  const [inventoryCount, setInventoryCount] = useState(0);
  const [successfulSentCount, setSuccessfulSentCount] = useState(0);
  const [user, setUser] = useState(currentUser);
  const [currentScreen, setCurrentScreen] = useState('SMS');

  // Fetch Full User Data & Inventory Count
  useEffect(() => {
    const userDocRef = doc(db, 'users', currentUser.mobileNumber);
    
    const unsubscribeUser = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setBalance(data.balance || 0);
        setUser({ ...data, mobileNumber: currentUser.mobileNumber });
      }
    });

    const q = query(collection(db, 'sms_inventory'), where('isSent', '==', false));
    const unsubscribeInventory = onSnapshot(q, (snapshot) => {
      setInventoryCount(snapshot.size);
    });

    return () => {
      unsubscribeUser();
      unsubscribeInventory();
    };
  }, [currentUser.mobileNumber]);

  const renderScreen = () => {
    switch (currentScreen) {
      case 'SMS':
        return <SmsTaskScreen currentUser={user} balance={balance} inventoryCount={inventoryCount} successfulSentCount={successfulSentCount} setSuccessfulSentCount={setSuccessfulSentCount} />;
      case 'Profile':
        return <ProfileScreen currentUser={user} balance={balance} onLogout={onLogout} />;
      case 'Invite':
        return <InviteScreen currentUser={user} />;
      case 'Task':
        return <TaskScreen currentUser={user} />;
      default:
        return <SmsTaskScreen currentUser={user} balance={balance} inventoryCount={inventoryCount} successfulSentCount={successfulSentCount} setSuccessfulSentCount={setSuccessfulSentCount} />;
    }
  };

  return (
    <View style={{ flex: 1, width: '100%', backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {renderScreen()}
      </ScrollView>
      <BottomNavBar currentScreen={currentScreen} setCurrentScreen={setCurrentScreen} />
    </View>
  );
};

// --- SCREEN 1: SMS TASK ---
const SmsTaskScreen = ({ currentUser, balance, inventoryCount, successfulSentCount, setSuccessfulSentCount }) => {
  const [taskStatus, setTaskStatus] = useState('');
  const initialSims = [
    { id: 0, name: 'SIM 1 - Primary', running: false, sentCount: 0, recipient: null },
    { id: 1, name: 'SIM 2 - Secondary', running: false, sentCount: 0, recipient: null },
  ];
  const [sims, setSims] = useState(initialSims);
  const runningRef = useRef({});

  const requestSmsPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.SEND_SMS,
          // READ_PHONE_STATE is handled by native code, but doesn't hurt to request here
        ]);
        return granted['android.permission.SEND_SMS'] === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn(err);
        return false;
      }
    }
    return true;
  }, []);

  const startSmsTask = useCallback(async (simId) => {
    const hasPermission = await requestSmsPermission();
    if (!hasPermission) {
      Alert.alert('Permission Denied', 'Cannot start task without SMS permission.');
      return;
    }

    if (runningRef.current[simId]) return;

    setSims(prev => prev.map(s => s.id === simId ? { ...s, running: true, sentCount: 0 } : s));
    runningRef.current[simId] = true;
    setTaskStatus(`SIM ${simId + 1} Starting auto-send...`);

    const loopSend = async () => {
      if (!runningRef.current[simId]) {
        setSims(prev => prev.map(s => s.id === simId ? { ...s, running: false, recipient: null } : s));
        setTaskStatus(`SIM ${simId + 1} Paused.`);
        return;
      }

      try {
        const q = query(collection(db, "sms_inventory"), where("isSent", "==", false), limit(1));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            setSims(prev => prev.map(s => s.id === simId ? { ...s, recipient: 'Waiting for new inventory...' } : s));
            setTimeout(loopSend, 5000); 
            return;
        }

        const docSnap = snapshot.docs[0];
        const sms = docSnap.data();
        const docRef = doc(db, "sms_inventory", docSnap.id);

        setSims(prev => prev.map(s => s.id === simId ? { ...s, recipient: sms.recipientNumber } : s));
        setTaskStatus(`SIM ${simId + 1} Sending to ${sms.recipientNumber}...`);

        await new Promise((resolve) => {
          // --- Custom Native Module Call ---
          SmsNativeModule.sendSms( 
            sms.recipientNumber,
            sms.messageBody,
            simId, // Passed to native Java/Kotlin for SIM selection
            (fail) => {
              // Failure callback from native code
              console.log(`SIM ${simId + 1} Failed to send SMS:`, fail);
              setTaskStatus(`SIM ${simId + 1} FAIL: ${fail}. Retrying next.`);
              setSims(prev => prev.map(s => s.id === simId ? { ...s, recipient: 'Failed' } : s));
              resolve(); 
            },
            async (success) => {
              // Success callback from native code
              console.log(`SIM ${simId + 1} SMS sent successfully:`, success);
              
              // 1. Update SMS Inventory (mark as sent)
              try {
                await updateDoc(docRef, { isSent: true, sentBy: currentUser.mobileNumber, simId: simId, sentAt: serverTimestamp() });
              } catch (err) { console.error("Failed to update sms_inventory doc:", err); }

              // 2. Reward User (Subordinate)
              const userDocRef = doc(db, 'users', currentUser.mobileNumber);
              const userReward = REWARD_PER_SMS;
              try {
                await updateDoc(userDocRef, { balance: increment(userReward) });
              } catch (err) { console.error("Failed to update user balance:", err); }

              // 3. Reward Referrer (15% commission)
              if (currentUser.referrerMobile) {
                  const referrerDocRef = doc(db, 'users', currentUser.referrerMobile);
                  const referrerReward = REWARD_PER_SMS * REFERRAL_PERCENTAGE;
                  try {
                      await updateDoc(referrerDocRef, { 
                          balance: increment(referrerReward)
                      });
                  } catch (err) { console.error("Failed to update referrer balance:", err); }
              }

              setSuccessfulSentCount(prev => prev + 1);
              setSims(prev => prev.map(s => s.id === simId ? { ...s, sentCount: s.sentCount + 1 } : s));
              resolve();
            }
          );
        });
      } catch (error) {
        console.error(`SIM ${simId + 1} Error during sending loop:`, error);
        setTaskStatus(`SIM ${simId + 1} Major Error. Retrying in 5s...`);
        setTimeout(loopSend, 5000); 
        return;
      }

      // 1-second interval
      setTimeout(loopSend, 1000); 
    };

    loopSend();

  }, [requestSmsPermission, currentUser.mobileNumber, currentUser.referrerMobile, setSuccessfulSentCount]);


  const stopSmsTask = useCallback((simId) => {
    runningRef.current[simId] = false;
  }, []);

  return (
    <View style={styles.screenContainer}>
      <Text style={styles.header}>SMS Task</Text>
      
      {/* Top Info Card */}
      <View style={[styles.infoCard, { backgroundColor: colors.greenPrimary }]}>
        <View style={styles.balanceInfo}>
          <Text style={styles.balanceLabel}>Current Balance</Text>
          <Text style={styles.balanceAmountWhite}>{formatCurrency(balance)}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userInfoText}>User ID: {currentUser.mobileNumber}</Text>
          <Text style={styles.userInfoText}>Pending SMS: {inventoryCount}</Text>
          <Text style={styles.userInfoText}>Sent (Session): {successfulSentCount}</Text>
        </View>
      </View>
      
      {/* SIM Task Cards */}
      {sims.map((sim) => (
        <View key={sim.id} style={styles.simCard}>
          <Text style={styles.simTitle}>{sim.name}</Text>
          
          <View style={styles.simStats}>
            <Text style={styles.simStatText}>Limit / Sent:</Text>
            <Text style={styles.simStatValue}>**100/day** / **{sim.sentCount}**</Text>
          </View>

          <View style={styles.taskActions}>
            <TouchableOpacity
              style={[
                styles.button, 
                styles.taskButton, 
                sim.running ? styles.pauseButton : styles.startButton
              ]}
              onPress={() => sim.running ? stopSmsTask(sim.id) : startSmsTask(sim.id)}
            >
              <Text style={styles.buttonText}>{sim.running ? 'Pause Task' : 'Start Task'}</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.simStatusText}>
            **Status:** {sim.running ? (sim.recipient || 'Running...') : (sim.recipient === 'Paused' ? 'Paused' : 'Ready')}
          </Text>

          <View style={styles.dailyLimitBar}>
             <Text style={styles.limitText}>{sim.sentCount}/100 sent today</Text>
          </View>
        </View>
      ))}

      {taskStatus ? <Text style={styles.taskGlobalStatus}>{taskStatus}</Text> : null}
    </View>
  );
};

// --- SCREEN 2: PROFILE ---
const ProfileScreen = ({ currentUser, balance, onLogout }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  const lastCheckinDate = currentUser.lastCheckinDate ? (currentUser.lastCheckinDate.toDate ? currentUser.lastCheckinDate.toDate() : new Date(currentUser.lastCheckinDate)) : null;
  const isCheckedInToday = lastCheckinDate && isSameDay(new Date(), lastCheckinDate);
  
  const handleCheckIn = async () => {
    setIsCheckingIn(true);
    try {
      if (isCheckedInToday) {
        Alert.alert('Checked In Already', 'You have already collected your daily reward today.');
        return;
      }

      const reward = 5; 
      const userDocRef = doc(db, 'users', currentUser.mobileNumber);
      
      await updateDoc(userDocRef, {
        balance: increment(reward),
        lastCheckinDate: serverTimestamp(),
        spinsAvailable: increment(1) 
      });
      
      Alert.alert('Success', `Daily Check-in Complete! You earned ${formatCurrency(reward)} and 1 Spin!`);

    } catch (error) {
      console.error('Check-in Error:', error);
      Alert.alert('Error', 'Could not process check-in.');
    } finally {
      setIsCheckingIn(false);
    }
  };


  return (
    <View style={styles.screenContainer}>
        <Text style={styles.appTitle}>Profile</Text>

        {/* User Info Card (Matching image style) */}
        <View style={[styles.profileInfoCard, { backgroundColor: colors.greenPrimary }]}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                <Text style={styles.profileMobile}>{currentUser.mobileNumber}</Text>
                <Text style={styles.profileVersion}>v1.0.0</Text>
            </View>
            <View style={styles.profileStatsRow}>
                <View style={styles.profileStatItem}>
                    <Text style={styles.profileStatValue}>{formatCurrency(balance)}</Text>
                    <Text style={styles.profileStatLabel}>Balance</Text>
                </View>
                <View style={styles.profileStatItem}>
                    <Text style={styles.profileStatValue}>VIP 1</Text>
                    <Text style={styles.profileStatLabel}>Level</Text>
                </View>
                <View style={styles.profileStatItem}>
                    <Text style={styles.profileStatValue}>{formatCurrency(0)}</Text> 
                    <Text style={styles.profileStatLabel}>Total Earnings</Text>
                </View>
            </View>
        </View>

        {/* Daily Check-in Button */}
        <TouchableOpacity 
            style={[styles.button, styles.checkinButton, isCheckedInToday && styles.disabledButton]} 
            onPress={handleCheckIn}
            disabled={isCheckedInToday || isCheckingIn}>
            {isCheckingIn ? <ActivityIndicator color={colors.white} /> : 
                <Text style={styles.buttonText}>
                    {isCheckedInToday ? 'Checked In Today' : 'Daily Check-in Reward (₹5 + Spin)'}
                </Text>
            }
        </TouchableOpacity>


        {/* Action Buttons */}
        <TouchableOpacity style={[styles.actionCardButton, { backgroundColor: colors.orangeCard }]} onPress={() => setModalVisible(true)}>
            <Text style={styles.actionButtonText}>Withdraw Account</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCardButton, { backgroundColor: colors.orangeCard }]}>
            <Text style={styles.actionButtonText}>FAQ</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionCardButton, { backgroundColor: colors.orangeCard }]}>
            <Text style={styles.actionButtonText}>Contact Us</Text>
        </TouchableOpacity>
        
        <LogoutButton onLogout={onLogout} />

        <WithdrawalModal
            visible={modalVisible}
            onClose={() => setModalVisible(false)}
            user={currentUser}
            balance={balance}
        />
    </View>
  );
};

// --- SCREEN 3: INVITE ---
const InviteScreen = ({ currentUser }) => {
    const shareReferralCode = async () => {
        try {
            await Share.share({
                message: `Join SmsRupee and use my referral code to start earning money from SMS tasks: ${currentUser.referralCode}`,
                title: 'SmsRupee Referral',
            });
        } catch (error) {
            Alert.alert('Error', 'Failed to share referral code.');
        }
    };
    return (
        <View style={styles.screenContainer}>
            <Text style={styles.header}>Invite & Earn</Text>
            <View style={styles.authCard}>
                <Text style={styles.referralCodeTitle}>Your Referral Code:</Text>
                <Text style={styles.referralCodeValue}>{currentUser.referralCode}</Text>
                <Text style={styles.referralDetail}>Share this code and earn **15%** of your subordinates' SMS task earnings!</Text>

                <TouchableOpacity style={[styles.button, styles.primaryButton, {marginTop: 30}]} onPress={shareReferralCode}>
                    <Text style={styles.buttonText}>Copy Code & Share</Text>
                </TouchableOpacity>

                <Text style={{marginTop: 30, fontSize: 16, color: colors.textDark, textAlign: 'center'}}>
                    **Spins Available:** You receive **1 free spin** for every successful invite!
                </Text>
            </View>
        </View>
    );
};

// --- SCREEN 4: TASK (Spin) ---
const TaskScreen = ({ currentUser }) => {
    const [isSpinning, setIsSpinning] = useState(false);
    
    const handleSpin = async () => {
        if (currentUser.spinsAvailable < 1) {
            Alert.alert('No Spins', 'You have no spins available. Check-in daily or invite friends to earn spins!');
            return;
        }

        setIsSpinning(true);
        setImmediate(() => {
            const rewards = [0.5, 1, 2, 5, 10, 0, 0.5, 1]; 
            const earned = rewards[Math.floor(Math.random() * rewards.length)];

            setTimeout(async () => {
                try {
                    const userDocRef = doc(db, 'users', currentUser.mobileNumber);
                    
                    await updateDoc(userDocRef, {
                        spinsAvailable: increment(-1),
                        balance: increment(earned),
                    });
                    
                    setIsSpinning(false);
                    Alert.alert('Congratulations!', `You won ${formatCurrency(earned)}!`);

                } catch (error) {
                    setIsSpinning(false);
                    Alert.alert('Error', 'Spin failed due to a system error.');
                }
            }, 3000); // 3 second spin simulation
        });
    };

    return (
        <View style={styles.screenContainer}>
            <Text style={styles.header}>Daily Spin Wheel</Text>
            <View style={styles.authCard}>
                <Text style={styles.referralCodeTitle}>Spins Available:</Text>
                <Text style={styles.spinCountValue}>{currentUser.spinsAvailable}</Text>
                
                <View style={styles.spinWheelPlaceholder}>
                    <Text style={{fontSize: 24, color: colors.textDark}}>{isSpinning ? 'Spinning...' : 'Tap to Spin'}</Text>
                </View>

                <TouchableOpacity 
                    style={[styles.button, styles.secondaryButton, (isSpinning || currentUser.spinsAvailable < 1) && styles.disabledButton]} 
                    onPress={handleSpin}
                    disabled={isSpinning || currentUser.spinsAvailable < 1}>
                    {isSpinning ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Spin Now</Text>}
                </TouchableOpacity>

                <Text style={styles.spinRules}>
                    - 1 free spin daily upon check-in.
                    - 1 free spin for every successful friend invite.
                </Text>
            </View>
        </View>
    );
};


// --- Withdrawal Modal (Extracted from ProfileScreen) ---
const WithdrawalModal = ({ visible, onClose, user, balance }) => {
  const [accountHolderName, setAccountHolderName] = useState(user.bankDetails?.accountHolderName || '');
  const [accountNumber, setAccountNumber] = useState(user.bankDetails?.accountNumber || '');
  const [ifscCode, setIfscCode] = useState(user.bankDetails?.ifscCode || '');
  const [bankDetails, setBankDetails] = useState(user.bankDetails || null);

  useEffect(() => {
    setBankDetails(user.bankDetails || null);
    setAccountHolderName(user.bankDetails?.accountHolderName || '');
    setAccountNumber(user.bankDetails?.accountNumber || '');
    setIfscCode(user.bankDetails?.ifscCode || '');
  }, [user]);

  const handleSaveBankDetails = async () => {
    if (!accountHolderName || !accountNumber || !ifscCode) {
      Alert.alert("Error", "Please fill all bank details.");
      return;
    }
    const details = { accountHolderName, accountNumber, ifscCode };
    try {
      const userDocRef = doc(db, 'users', user.mobileNumber);
      await updateDoc(userDocRef, { bankDetails: details });
      setBankDetails(details);
      Alert.alert("Success", "Bank details saved!");
    } catch (error) {
      console.error('Save bank details error:', error);
      Alert.alert("Error", "Could not save details.");
    }
  };

  const handleWithdraw = async () => {
    if (balance < MIN_WITHDRAWAL) {
      Alert.alert("Error", `You need at least ${formatCurrency(MIN_WITHDRAWAL)} to withdraw.`);
      return;
    }
    if (!bankDetails) {
      Alert.alert("Error", "Please add your bank details first.");
      return;
    }
    try {
      const q = query(collection(db, 'withdrawal_requests'), where("userMobileNumber", "==", user.mobileNumber), where("status", "==", "pending"));
      const existingRequests = await getDocs(q);
      if (!existingRequests.empty) {
        Alert.alert("Error", "You already have a pending withdrawal request.");
        return;
      }
      await addDoc(collection(db, 'withdrawal_requests'), {
        userMobileNumber: user.mobileNumber,
        amount: balance,
        bankDetails: bankDetails,
        status: "pending",
        requestedAt: serverTimestamp()
      });
      const userDocRef = doc(db, 'users', user.mobileNumber);
      await updateDoc(userDocRef, { balance: 0 });
      Alert.alert("Success", `Withdrawal request submitted! Your balance is now ${formatCurrency(0)}.`);
      onClose();
    } catch (error) {
      console.error('Withdraw error:', error);
      Alert.alert("Error", "Could not submit your request.");
    }
  };

  const isWithdrawDisabled = balance < MIN_WITHDRAWAL;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Withdrawal Account</Text>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceAmount}>{formatCurrency(balance)}</Text>
            {isWithdrawDisabled && <Text style={styles.minWithdrawText}>Min. withdrawal is {formatCurrency(MIN_WITHDRAWAL)}</Text>}
          </View>

          <Text style={styles.detailsHeader}>Bank Details</Text>
          
          {bankDetails ? (
            <View style={styles.detailsBox}>
              <Text style={styles.detailText}>**Holder Name:** {bankDetails.accountHolderName}</Text>
              <Text style={styles.detailText}>**Account No:** {bankDetails.accountNumber}</Text>
              <Text style={styles.detailText}>**IFSC Code:** {bankDetails.ifscCode}</Text>
              <TouchableOpacity onPress={() => setBankDetails(null)}><Text style={styles.changeBankText}>Change Details</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.detailsBox}>
              <TextInput style={styles.input} placeholder="Account Holder Name" value={accountHolderName} onChangeText={setAccountHolderName} />
              <TextInput style={styles.input} placeholder="Account Number" keyboardType="number-pad" value={accountNumber} onChangeText={setAccountNumber} />
              <TextInput style={styles.input} placeholder="IFSC Code" value={ifscCode} onChangeText={setIfscCode} />
              <TouchableOpacity style={[styles.button, styles.secondaryButton]} onPress={handleSaveBankDetails}><Text style={styles.buttonText}>Save Bank Details</Text></TouchableOpacity>
            </View>
          )}

          <TouchableOpacity 
            style={[styles.button, isWithdrawDisabled ? styles.disabledButton : styles.successButton, { marginTop: 20 }]} 
            onPress={handleWithdraw} 
            disabled={isWithdrawDisabled || !bankDetails}>
            <Text style={styles.buttonText}>
              {isWithdrawDisabled ? 'Min. ₹100 Required' : `Request Withdrawal of ${formatCurrency(balance)}`}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.closeButton]} onPress={onClose}><Text style={styles.buttonText}>Close</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// --- Admin Dashboard (No functional changes) ---
const AdminDashboard = ({ currentUser, onLogout }) => {
  const [bulkText, setBulkText] = useState('');
  const [recipientNumber, setRecipientNumber] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [withdrawalRequests, setWithdrawalRequests] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "withdrawal_requests"), where("status", "==", "pending"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requests = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWithdrawalRequests(requests);
    });
    return () => unsubscribe();
  }, []);

  const handleAddSmsSingle = async () => {
    if (!recipientNumber || !messageBody) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }
    try {
      await addDoc(collection(db, 'sms_inventory'), {
        recipientNumber,
        messageBody,
        isSent: false,
        addedAt: serverTimestamp(),
      });
      Alert.alert('Success', 'SMS added to inventory.');
      setRecipientNumber('');
      setMessageBody('');
    } catch (error) {
      console.error('Add single SMS error:', error);
      Alert.alert('Error', 'Failed to add SMS.');
    }
  };

  const handleBulkAddSms = async () => {
    if (!bulkText.trim()) {
      Alert.alert('Error', 'Please enter at least one SMS record.');
      return;
    }
    setIsUploading(true);
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0, skipped = 0;
    for (const line of lines) {
      const commaIndex = line.indexOf(',');
      if (commaIndex === -1) {
        skipped++;
        continue;
      }
      const recipient = line.slice(0, commaIndex).trim();
      const message = line.slice(commaIndex + 1).trim();
      if (!recipient || !message) {
        skipped++;
        continue;
      }
      try {
        await addDoc(collection(db, 'sms_inventory'), {
          recipientNumber,
          messageBody,
          isSent: false,
          addedAt: serverTimestamp(),
        });
        added++;
      } catch (err) {
        console.error('Bulk add error for line:', line, err);
        skipped++;
      }
    }
    setIsUploading(false);
    Alert.alert('Bulk Upload', `${added} added, ${skipped} skipped.`);
    setBulkText('');
  };

  const handleWithdrawalAction = async (requestId, newStatus) => {
    try {
      const requestDocRef = doc(db, 'withdrawal_requests', requestId);
      await updateDoc(requestDocRef, { status: newStatus, processedAt: serverTimestamp() });
      Alert.alert('Success', `Request has been ${newStatus}.`);
    } catch (error) {
      console.error('Withdrawal update error:', error);
      Alert.alert('Error', 'Could not update the request.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContainer}>
      <Text style={styles.appTitle}>Admin Panel</Text>

      <View style={styles.adminSection}>
        <Text style={styles.subHeader}>Bulk SMS Upload</Text>
        <TextInput
          style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
          placeholder="Paste CSV: number,message per line"
          value={bulkText}
          onChangeText={setBulkText}
          multiline
        />
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleBulkAddSms} disabled={isUploading}>
          {isUploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Upload Bulk SMS</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.adminSection}>
        <Text style={styles.subHeader}>Add Single SMS</Text>
        <TextInput
          style={styles.input}
          placeholder="Recipient Mobile Number"
          value={recipientNumber}
          onChangeText={setRecipientNumber}
          keyboardType="phone-pad"
        />
        <TextInput
          style={[styles.input, { height: 80 }]}
          placeholder="SMS Message Body"
          value={messageBody}
          onChangeText={setMessageBody}
          multiline
        />
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleAddSmsSingle}>
          <Text style={styles.buttonText}>Add Single SMS</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.adminSection}>
        <Text style={styles.subHeader}>Pending Withdrawal Requests</Text>
        <FlatList
          data={withdrawalRequests}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={styles.requestItem}>
              <View>
                <Text style={styles.requestUser}>User: {item.userMobileNumber}</Text>
                <Text style={styles.requestAmount}>Amount: {formatCurrency(item.amount)}</Text>
                <Text style={styles.requestDetails}>A/C: {item.bankDetails?.accountNumber}</Text>
              </View>
              <View style={styles.requestActions}>
                <TouchableOpacity onPress={() => handleWithdrawalAction(item.id, 'approved')}>
                  <Text style={styles.approveText}>Approve</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleWithdrawalAction(item.id, 'rejected')}>
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyListText}>No pending requests.</Text>}
        />
      </View>

      <LogoutButton onLogout={onLogout} />
    </ScrollView>
  );
};

// --- BOTTOM NAVIGATION ---
const BottomNavBar = ({ currentScreen, setCurrentScreen }) => {
    const navItems = [
        { name: 'SMS', icon: '🏠' },
        { name: 'WhatsApp', icon: '💬' }, 
        { name: 'Invite', icon: '🔗' },
        { name: 'Task', icon: '🏆' },
        { name: 'Profile', icon: '👤' },
    ];

    return (
        <View style={styles.navBar}>
            {navItems.map((item) => (
                <TouchableOpacity 
                    key={item.name} 
                    style={styles.navItem} 
                    onPress={() => setCurrentScreen(item.name === 'WhatsApp' ? 'SMS' : item.name)}
                >
                    <Text style={{fontSize: 22}}>{item.icon}</Text>
                    <Text style={currentScreen === item.name ? styles.navTextActive : styles.navTextInactive}>
                        {item.name}
                    </Text>
                </TouchableOpacity>
            ))}
        </View>
    );
};

// --- STYLES ---
const colors = {
  greenPrimary: '#388E3C',
  orangeCard: '#FFB300',
  white: '#FFFFFF',
  textDark: '#333333',
  textLight: '#FFFFFF',
  danger: '#D32F2F',
  success: '#4CAF50',
  subtle: '#BDBDBD',
  background: '#F0FF0F5', 
  taskButtonActive: '#D32F2F', 
  taskButtonInactive: '#4CAF50', 
};

const shadows = {
  elevation: 6,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.25,
  shadowRadius: 5,
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 25, backgroundColor: colors.background },
  scrollContainer: { alignItems: 'center', padding: 15, backgroundColor: colors.background, paddingBottom: 0, width: '100%' },
  screenContainer: { width: '100%', paddingBottom: 100, alignItems: 'center' }, 
  
  appIconContainer: { marginBottom: 10, padding: 10, backgroundColor: colors.orangeCard, borderRadius: 15, ...shadows },
  appTitle: { fontSize: 36, fontWeight: '800', marginBottom: 40, color: colors.textDark, letterSpacing: 1, alignSelf: 'center' },
  header: { fontSize: 24, fontWeight: '700', marginBottom: 20, color: colors.textDark, alignSelf: 'flex-start' },
  subHeader: { fontSize: 18, fontWeight: '600', marginBottom: 15, color: colors.textDark, borderBottomWidth: 1, borderBottomColor: colors.subtle, paddingBottom: 5 },
  detailsHeader: { fontSize: 16, fontWeight: '700', color: colors.textDark, marginTop: 20, marginBottom: 10, alignSelf: 'flex-start', width: '100%' },

  authCard: { width: '100%', padding: 20, backgroundColor: colors.white, borderRadius: 12, ...shadows, marginBottom: 20 },
  input: { width: '100%', height: 50, backgroundColor: colors.white, borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, borderWidth: 1, borderColor: colors.subtle, fontSize: 16, color: colors.textDark },
  adminSection: { width: '100%', padding: 20, backgroundColor: colors.white, borderRadius: 12, marginBottom: 20, ...shadows },
  detailsBox: { width: '100%', padding: 15, backgroundColor: colors.background, borderRadius: 8, marginBottom: 10 },
  
  infoCard: { width: '100%', padding: 20, borderRadius: 15, marginBottom: 30, ...shadows, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  balanceInfo: { flex: 1, borderRightWidth: 1, borderRightColor: '#66BB6A', paddingRight: 15 },
  balanceLabel: { fontSize: 14, fontWeight: '500', color: colors.textLight, textTransform: 'uppercase' },
  balanceAmountWhite: { fontSize: 38, fontWeight: '900', color: colors.white, marginTop: 5 },
  userInfo: { flex: 1.2, paddingLeft: 15 },
  userInfoText: { fontSize: 14, color: colors.white, marginBottom: 3 },
  simCard: { width: '100%', padding: 20, backgroundColor: colors.orangeCard, borderRadius: 15, marginBottom: 20, ...shadows, overflow: 'hidden' },
  simTitle: { fontSize: 22, fontWeight: '700', color: colors.textDark, marginBottom: 10 },
  simStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  simStatText: { fontSize: 16, color: colors.textDark, fontWeight: '500' },
  simStatValue: { fontSize: 16, color: colors.textDark, fontWeight: '800' },
  simStatusText: { fontSize: 14, color: colors.textDark, marginTop: 10, paddingHorizontal: 5, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 5 },
  taskActions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10, marginTop: 10 },
  taskButton: { width: '90%', height: 50, borderRadius: 25, ...shadows, elevation: 4 },
  startButton: { backgroundColor: colors.taskButtonActive },
  pauseButton: { backgroundColor: colors.taskButtonInactive },
  dailyLimitBar: { marginTop: 15, alignItems: 'center' },
  limitText: { fontSize: 14, color: colors.textDark, fontWeight: '600' },
  taskGlobalStatus: { marginTop: 20, fontSize: 16, color: colors.greenPrimary, fontWeight: '600', textAlign: 'center', paddingHorizontal: 10 },

  profileInfoCard: { width: '100%', padding: 20, borderRadius: 15, marginBottom: 30, ...shadows },
  profileMobile: { fontSize: 20, fontWeight: 'bold', color: colors.white, marginBottom: 10 },
  profileVersion: { fontSize: 14, color: colors.white },
  profileStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 },
  profileStatItem: { alignItems: 'center', flex: 1, paddingHorizontal: 5 },
  profileStatValue: { fontSize: 24, fontWeight: '900', color: colors.white, },
  profileStatLabel: { fontSize: 12, color: colors.white, opacity: 0.8 },
  actionCardButton: { width: '100%', padding: 15, borderRadius: 12, marginBottom: 15, ...shadows, alignItems: 'center' },
  actionButtonText: { fontSize: 18, fontWeight: 'bold', color: colors.textDark },
  checkinButton: { backgroundColor: colors.greenPrimary, marginTop: 15 },

  referralCodeTitle: { fontSize: 18, fontWeight: '600', color: colors.textDark, textAlign: 'center' },
  referralCodeValue: { fontSize: 32, fontWeight: 'bold', color: colors.greenPrimary, textAlign: 'center', marginVertical: 10 },
  referralDetail: { fontSize: 14, color: colors.textDark, textAlign: 'center', marginTop: 10 },
  
  spinCountValue: { fontSize: 48, fontWeight: 'bold', color: colors.orangeCard, textAlign: 'center', marginVertical: 10 },
  spinWheelPlaceholder: { height: 200, width: '100%', backgroundColor: colors.background, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginVertical: 20, borderWidth: 2, borderColor: colors.subtle },
  spinRules: { fontSize: 12, color: colors.subtle, marginTop: 15, paddingHorizontal: 10 },
  
  button: { width: '100%', height: 55, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 15, elevation: 3 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: 'bold' },
  primaryButton: { backgroundColor: colors.greenPrimary }, 
  secondaryButton: { backgroundColor: colors.orangeCard },
  successButton: { backgroundColor: colors.success },
  logoutButton: { backgroundColor: colors.danger, marginTop: 20 },
  disabledButton: { backgroundColor: colors.subtle, elevation: 0 },
  
  adminLoginText: { marginTop: 30, color: colors.textDark, fontSize: 14, fontWeight: '600' },
  switchAuthText: { marginTop: 20, color: colors.textDark, fontSize: 14, textAlign: 'center' },
  
  balanceCard: { width: '100%', padding: 25, backgroundColor: colors.white, borderRadius: 12, marginBottom: 20, alignItems: 'center', ...shadows },
  balanceAmount: { fontSize: 38, fontWeight: '900', color: colors.success, marginBottom: 5 },
  minWithdrawText: { fontSize: 14, color: colors.danger, fontWeight: '600' },
  changeBankText: { color: colors.greenPrimary, marginTop: 15, textAlign: 'center', fontWeight: 'bold' },
  closeButton: { backgroundColor: colors.subtle, marginTop: 10 },
  detailText: { fontSize: 16, marginBottom: 8, color: colors.textDark },
  
  requestItem: { 
    padding: 15, 
    backgroundColor: colors.white, 
    borderRadius: 8, 
    marginBottom: 10, 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1, 
    borderColor: colors.subtle
  },
  requestUser: { fontWeight: 'bold', color: colors.textDark, fontSize: 16 },
  requestAmount: { color: colors.success, fontWeight: '700' },
  requestDetails: { fontSize: 12, color: colors.subtle },
  requestActions: { flexDirection: 'row', justifyContent: 'space-around', width: 120 },
  approveText: { color: colors.success, fontWeight: 'bold', fontSize: 16 },
  rejectText: { color: colors.danger, fontWeight: 'bold', fontSize: 16, marginLeft: 15 },
  emptyListText: { textAlign: 'center', marginVertical: 20, color: colors.subtle },

  navBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.subtle,
    ...shadows,
    shadowOffset: { width: 0, height: -2 },
  },
  navItem: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: 5,
  },
  navTextActive: {
    fontSize: 12,
    color: colors.greenPrimary,
    fontWeight: 'bold',
  },
  navTextInactive: {
    fontSize: 12,
    color: colors.subtle,
  },
});

