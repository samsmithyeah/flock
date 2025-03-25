import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

interface PollCreationModalProps {
  visible: boolean;
  onClose: () => void;
  onCreatePoll: (question: string, options: string[]) => void;
}

const PollCreationModal: React.FC<PollCreationModalProps> = ({
  visible,
  onClose,
  onCreatePoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']); // Start with two empty options
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addOption = () => {
    setOptions([...options, '']);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) {
      Toast.show({
        type: 'info',
        text1: 'Required',
        text2: 'A poll needs at least 2 options',
      });
      return;
    }
    const newOptions = [...options];
    newOptions.splice(index, 1);
    setOptions(newOptions);
  };

  const updateOption = (text: string, index: number) => {
    const newOptions = [...options];
    newOptions[index] = text;
    setOptions(newOptions);
  };

  const handleCreatePoll = () => {
    // Validate inputs
    if (!question.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please enter a question',
      });
      return;
    }

    const validOptions = options.filter((opt) => opt.trim().length > 0);
    if (validOptions.length < 2) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please provide at least 2 options',
      });
      return;
    }

    setIsSubmitting(true);

    // Call the onCreatePoll callback with the question and valid options
    onCreatePoll(question.trim(), validOptions);

    // Reset state and close the modal
    setQuestion('');
    setOptions(['', '']);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.centeredView}
      >
        <View style={styles.modalView}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Create a poll</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.label}>Question</Text>
            <TextInput
              style={styles.questionInput}
              placeholder="Enter your question"
              value={question}
              onChangeText={setQuestion}
              multiline
            />

            <Text style={styles.label}>Options</Text>
            {options.map((option, index) => (
              <View key={index} style={styles.optionContainer}>
                <TextInput
                  style={styles.optionInput}
                  placeholder={`Option ${index + 1}`}
                  value={option}
                  onChangeText={(text) => updateOption(text, index)}
                />
                <TouchableOpacity
                  onPress={() => removeOption(index)}
                  style={styles.removeButton}
                >
                  <Ionicons name="trash-outline" size={20} color="#ff4a4a" />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity
              onPress={addOption}
              style={styles.addOptionButton}
            >
              <Ionicons name="add-circle-outline" size={20} color="#0a84ff" />
              <Text style={styles.addOptionText}>Add option</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity
            style={[styles.createButton, isSubmitting && styles.disabledButton]}
            onPress={handleCreatePoll}
            disabled={isSubmitting}
          >
            <Text style={styles.createButtonText}>Create poll</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
      <Toast />
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  scrollView: {
    maxHeight: '80%',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 10,
    marginBottom: 5,
  },
  questionInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    marginBottom: 15,
  },
  optionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
  },
  removeButton: {
    padding: 10,
    marginLeft: 10,
  },
  addOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    padding: 5,
  },
  addOptionText: {
    color: '#0a84ff',
    marginLeft: 5,
  },
  createButton: {
    backgroundColor: '#0a84ff',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    marginTop: 15,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  createButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default PollCreationModal;
