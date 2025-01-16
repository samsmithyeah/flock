import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableWithoutFeedback,
  Keyboard,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import Toast from 'react-native-toast-message';
import Colors from '@/styles/colors';
import {
  CodeField,
  Cursor,
  useBlurOnFulfill,
  useClearByFocusCell,
} from 'react-native-confirmation-code-field';
import { CountryPicker } from 'react-native-country-codes-picker';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/firebase';
import { useUser } from '@/context/UserContext';
import CustomButton from '@/components/CustomButton';
import { User } from '@/types/User';
import { useRoute, RouteProp } from '@react-navigation/native';
import { NavParamList } from '@/navigation/AppNavigator';

const CELL_COUNT = 6;

// ----------- INTERFACES FOR CALLABLE FUNCTIONS -----------
interface SendCodeRequest {
  phone: string;
}

interface SendCodeResponse {
  success: boolean;
  message: string;
}

interface VerifyCodeRequest {
  phone: string;
  code: string;
}

interface VerifyCodeResponse {
  success: boolean;
  message: string;
}

// -------------- HELPER FOR COUNTRY FLAG EMOJI --------------
const getFlagEmoji = (countryCode: string): string => {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
};

// ------------------- MAIN COMPONENT ------------------------
const PhoneVerificationScreen: React.FC = () => {
  const [selectedCountry, setSelectedCountry] = useState<{
    dial_code: string;
    country_code: string;
    name: string;
  }>({
    dial_code: '+44',
    country_code: 'GB',
    name: 'United Kingdom',
  });

  const route = useRoute<RouteProp<NavParamList, 'PhoneVerification'>>();
  const { uid } = route.params;

  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [isVerificationCodeSent, setIsVerificationCodeSent] =
    useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [formError, setFormError] = useState<string>('');
  const [showCountryPicker, setShowCountryPicker] = useState<boolean>(false);
  const [fullPhoneNumber, setFullPhoneNumber] = useState<string>('');

  const { setUser } = useUser();

  // CodeField hooks
  const codeRef = useBlurOnFulfill({
    value: verificationCode,
    cellCount: CELL_COUNT,
  });
  const [codeFieldProps, getCellOnLayoutHandler] = useClearByFocusCell({
    value: verificationCode,
    setValue: setVerificationCode,
  });

  // Initialize Cloud Functions
  const functions = getFunctions();
  const sendCodeFn = httpsCallable<SendCodeRequest, SendCodeResponse>(
    functions,
    'sendCode',
  );
  const verifyCodeFn = httpsCallable<VerifyCodeRequest, VerifyCodeResponse>(
    functions,
    'verifyCode',
  );

  // Update full phone number whenever user changes input or country
  useEffect(() => {
    const sanitized = phoneNumber.trim().replace(/^0+/, '');
    const computedFullPhoneNumber = `${selectedCountry.dial_code}${sanitized}`;
    setFullPhoneNumber(computedFullPhoneNumber);
  }, [selectedCountry, phoneNumber]);

  // ------------------ SEND VERIFICATION CODE ------------------
  const handleSendVerification = async () => {
    setFormError('');
    if (!phoneNumber.trim()) {
      setFormError('Please enter your phone number.');
      return;
    }

    // Basic E.164 check
    const phoneRegex = /^\+[1-9]\d{1,14}$/;
    if (!phoneRegex.test(fullPhoneNumber)) {
      setFormError('Please enter a valid phone number in E.164 format.');
      return;
    }

    setLoading(true);
    try {
      const result = await sendCodeFn({ phone: fullPhoneNumber });
      // result.data is typed as SendCodeResponse
      if (result.data.success) {
        setIsVerificationCodeSent(true);
        Toast.show({
          type: 'success',
          text1: 'Verification code sent',
          text2: 'A verification code has been sent to your phone.',
        });
      }
    } catch (error) {
      console.error('Error sending verification code:', error);
      setFormError('Failed to send verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ------------------ VERIFY THE CODE ------------------
  const handleVerifyCode = async () => {
    setFormError('');
    if (!isVerificationCodeSent) {
      setFormError(
        'No verification process found. Please send the code again.',
      );
      return;
    }
    if (!verificationCode.trim()) {
      setFormError('Please enter the verification code.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyCodeFn({
        phone: fullPhoneNumber,
        code: verificationCode,
      });
      // result.data is typed as VerifyCodeResponse
      if (result.data.success) {
        // Code verified; update Firestore record
        const userDocRef = doc(db, 'users', uid!);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          // Cast DocumentData to your User type
          const userData = userDoc.data() as User;

          await updateDoc(userDocRef, {
            phoneNumber: fullPhoneNumber,
            country: selectedCountry.country_code,
          });

          setUser(userData);
          Toast.show({
            type: 'success',
            text1: 'Success',
            text2: 'Phone number verified',
          });
        } else {
          setFormError('User not found.');
        }
      }
    } catch (error) {
      console.error('Error verifying code:', error);
      setFormError(
        'Invalid verification code or network issue. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // --------------------- RENDER ---------------------
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        <View style={styles.formContainer}>
          <Text style={styles.title}>Verify your phone number</Text>
          {!!formError && <Text style={styles.error}>{formError}</Text>}

          {!isVerificationCodeSent && (
            <>
              <View style={styles.countryPickerContainer}>
                <TouchableOpacity
                  onPress={() => setShowCountryPicker(true)}
                  style={styles.countryPickerButton}
                >
                  <Text style={styles.flagText}>
                    {getFlagEmoji(selectedCountry.country_code)}
                  </Text>
                  <Text style={styles.countryCodeText}>
                    {selectedCountry.dial_code}
                  </Text>
                  <Text style={styles.dropdownArrow}>▼</Text>
                </TouchableOpacity>
                <TextInput
                  placeholder="Phone number"
                  placeholderTextColor="#666"
                  value={phoneNumber}
                  onChangeText={(text) => setPhoneNumber(text)}
                  style={styles.phoneInput}
                  keyboardType="phone-pad"
                />
              </View>

              <CountryPicker
                show={showCountryPicker}
                pickerButtonOnPress={(item: any) => {
                  setSelectedCountry({
                    dial_code: item.dial_code,
                    country_code: item.code,
                    name: item.name,
                  });
                  setShowCountryPicker(false);
                }}
                lang="en"
                style={{ modal: { height: '92%' } }}
              />

              <CustomButton
                title="Send verification code"
                onPress={handleSendVerification}
                loading={loading}
                disabled={!phoneNumber.trim()}
              />
            </>
          )}

          {isVerificationCodeSent && (
            <>
              <CodeField
                ref={codeRef}
                {...codeFieldProps}
                value={verificationCode}
                onChangeText={setVerificationCode}
                cellCount={CELL_COUNT}
                rootStyle={styles.codeFieldRoot}
                keyboardType="number-pad"
                renderCell={({ index, symbol, isFocused }) => (
                  <Text
                    key={index}
                    style={[styles.cell, isFocused && styles.focusCell]}
                    onLayout={getCellOnLayoutHandler(index)}
                  >
                    {symbol || (isFocused ? <Cursor /> : null)}
                  </Text>
                )}
              />
              <CustomButton
                title="Verify code"
                onPress={handleVerifyCode}
                loading={loading}
                disabled={verificationCode.length < CELL_COUNT}
              />
            </>
          )}
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
};

// --------------------- STYLES ---------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.flock,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  formContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 20,
    textAlign: 'center',
    color: '#222',
  },
  countryPickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  countryPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    marginRight: 10,
  },
  flagText: {
    fontSize: 24,
    marginRight: 5,
  },
  countryCodeText: {
    fontSize: 16,
    color: '#444',
  },
  dropdownArrow: {
    fontSize: 9,
    color: '#444',
    marginLeft: 2,
    marginTop: 9,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
    color: '#000',
  },
  codeFieldRoot: {
    marginBottom: 20,
    width: '100%',
    justifyContent: 'center',
  },
  cell: {
    width: 40,
    height: 40,
    lineHeight: 38,
    fontSize: 24,
    borderWidth: 2,
    borderColor: '#ccc',
    textAlign: 'center',
    borderRadius: 5,
    marginHorizontal: 5,
  },
  focusCell: {
    borderColor: '#000',
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 15,
  },
});

export default PhoneVerificationScreen;
