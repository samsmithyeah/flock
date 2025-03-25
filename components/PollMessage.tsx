import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Modal,
} from 'react-native';
import { useUser } from '@/context/UserContext';
import { useCrews } from '@/context/CrewsContext';
import { Ionicons } from '@expo/vector-icons';

interface PollProps {
  question: string;
  options: string[];
  votes: { [optionIndex: number]: string[] };
  totalVotes: number;
  messageId: string;
  onVote: (optionIndex: number) => void;
}

const PollMessage: React.FC<PollProps> = ({
  question,
  options,
  votes,
  totalVotes,
  messageId,
  onVote,
}) => {
  const { user } = useUser();
  const { usersCache } = useCrews();
  const [isVoting, setIsVoting] = useState<number | null>(null);
  const [voterListVisible, setVoterListVisible] = useState<number | null>(null);

  // Track local votes for immediate UI feedback
  const [localVotes, setLocalVotes] = useState<{
    [optionIndex: number]: string[];
  }>(votes);
  const [localTotalVotes, setLocalTotalVotes] = useState<number>(totalVotes);
  const [currentVote, setCurrentVote] = useState<number | null>(null);

  // Update local state when server data changes
  useEffect(() => {
    setLocalVotes(votes);
    setLocalTotalVotes(totalVotes);

    // Find the user's current vote
    if (user?.uid) {
      let foundVote = null;

      Object.entries(votes).forEach(([index, voterIds]) => {
        if (Array.isArray(voterIds) && voterIds.includes(user.uid)) {
          foundVote = parseInt(index);
        }
      });

      setCurrentVote(foundVote);
    }
  }, [votes, totalVotes, user?.uid]);

  // Handle voting on an option
  const handleVote = (optionIndex: number) => {
    if (!user?.uid) return;

    // Set UI voting indicator
    setIsVoting(optionIndex);

    // Calculate optimistic vote updates
    const updatedVotes = { ...localVotes };
    let updatedTotalVotes = localTotalVotes;

    // If clicking the same option (toggling off)
    if (currentVote === optionIndex) {
      // Remove vote from this option
      if (updatedVotes[optionIndex]) {
        updatedVotes[optionIndex] = updatedVotes[optionIndex].filter(
          (id) => id !== user.uid,
        );
      }
      updatedTotalVotes--;
      setCurrentVote(null);
    }
    // If switching votes
    else {
      // Remove previous vote if any
      if (currentVote !== null && updatedVotes[currentVote]) {
        updatedVotes[currentVote] = updatedVotes[currentVote].filter(
          (id) => id !== user.uid,
        );
      }

      // Add new vote
      if (!updatedVotes[optionIndex]) {
        updatedVotes[optionIndex] = [];
      }
      updatedVotes[optionIndex].push(user.uid);

      // If switching votes, total stays the same; if new vote, increase total
      if (currentVote === null) {
        updatedTotalVotes++;
      }

      setCurrentVote(optionIndex);
    }

    // Update local state immediately for optimistic UI
    setLocalVotes(updatedVotes);
    setLocalTotalVotes(updatedTotalVotes);

    // Call the onVote function to update the server
    onVote(optionIndex);

    // Reset voting indicator after a short delay
    setTimeout(() => setIsVoting(null), 500);
  };

  // Calculate percentages for each option using local votes
  const getPercentage = (optionIndex: number) => {
    const optionVotes = localVotes[optionIndex]?.length || 0;
    if (localTotalVotes === 0) return 0;
    return Math.round((optionVotes / localTotalVotes) * 100);
  };

  // Get voter names for an option
  const getVoterNames = (optionIndex: number) => {
    if (!localVotes[optionIndex]) return [];

    return localVotes[optionIndex].map((uid) => {
      const voter = usersCache[uid];
      return voter?.displayName || 'Unknown User';
    });
  };

  // Show the voter list for an option
  const showVoterList = (optionIndex: number) => {
    setVoterListVisible(optionIndex);
  };

  const renderVoterList = () => {
    if (voterListVisible === null) return null;

    const voters = getVoterNames(voterListVisible);

    return (
      <Modal
        visible={voterListVisible !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setVoterListVisible(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setVoterListVisible(null)}
        >
          <View style={styles.voterListContainer}>
            <View style={styles.voterListHeader}>
              <Text style={styles.voterListTitle}>
                Voted for: {options[voterListVisible]}
              </Text>
              <TouchableOpacity onPress={() => setVoterListVisible(null)}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {voters.length > 0 ? (
              <FlatList
                data={voters}
                keyExtractor={(item, index) => `voter-${index}`}
                renderItem={({ item }) => (
                  <Text style={styles.voterName}>{item}</Text>
                )}
              />
            ) : (
              <Text style={styles.noVotersText}>No votes yet</Text>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.question}>Poll: {question}</Text>

      <View style={styles.optionsContainer}>
        {options.map((option, index) => {
          const percentage = getPercentage(index);
          const isSelected = currentVote === index;
          const voterCount = localVotes[index]?.length || 0;
          const voterNames = getVoterNames(index);
          const displayedVoterNames = voterNames.slice(0, 2).join(', ');
          const hasMoreVoters = voterNames.length > 2;

          return (
            <View key={index} style={styles.optionOuterContainer}>
              <TouchableOpacity
                style={[
                  styles.optionButton,
                  isSelected && styles.selectedOption,
                ]}
                onPress={() => handleVote(index)}
                disabled={isVoting !== null}
                activeOpacity={0.6}
              >
                <View style={styles.optionContent}>
                  <View style={styles.optionTextContainer}>
                    <Text
                      style={[
                        styles.optionText,
                        isSelected && styles.selectedOptionText,
                      ]}
                    >
                      {option}
                    </Text>
                    {voterCount > 0 && (
                      <TouchableOpacity
                        onPress={() => showVoterList(index)}
                        style={styles.voterInfoContainer}
                      >
                        <Text style={styles.voterCount}>
                          {voterCount} vote{voterCount !== 1 ? 's' : ''}
                        </Text>
                        {voterCount > 0 && (
                          <Text style={styles.votersList} numberOfLines={1}>
                            {displayedVoterNames}
                            {hasMoreVoters ? ' + more' : ''}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>

                  {isVoting === index ? (
                    <ActivityIndicator size="small" color="#0a84ff" />
                  ) : (
                    <Text
                      style={[
                        styles.percentage,
                        isSelected && styles.selectedPercentage,
                      ]}
                    >
                      {percentage}%
                    </Text>
                  )}
                </View>

                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      isSelected && styles.selectedProgressBar,
                      { width: `${Math.max(percentage, 3)}%` },
                    ]}
                  />
                </View>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <Text style={styles.totalVotes}>
        {localTotalVotes} vote{localTotalVotes !== 1 ? 's' : ''}
      </Text>

      {renderVoterList()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    padding: 15,
    borderRadius: 12,
    marginBottom: 5,
    width: 280,
  },
  question: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  optionsContainer: {
    marginBottom: 10,
    width: '100%',
  },
  optionOuterContainer: {
    width: '100%',
    marginBottom: 10,
  },
  optionButton: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e1e8ed',
    width: '100%',
  },
  selectedOption: {
    borderColor: '#0a84ff',
    backgroundColor: '#f0f8ff',
    borderWidth: 2,
  },
  selectedOptionText: {
    color: '#0a84ff',
    fontWeight: '600',
  },
  optionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  optionTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  optionText: {
    fontSize: 15,
    color: '#333',
  },
  voterInfoContainer: {
    marginTop: 4,
  },
  voterCount: {
    fontSize: 12,
    color: '#666',
  },
  votersList: {
    fontSize: 11,
    color: '#888',
    marginTop: 2,
    fontStyle: 'italic',
  },
  percentage: {
    fontWeight: '600',
    fontSize: 14,
    color: '#555',
    marginLeft: 8,
  },
  selectedPercentage: {
    color: '#0a84ff',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#e1e8ed',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#0a84ff50',
    borderRadius: 3,
  },
  selectedProgressBar: {
    backgroundColor: '#0a84ff',
  },
  totalVotes: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voterListContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    width: '80%',
    maxHeight: '60%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  voterListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 8,
  },
  voterListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  voterName: {
    fontSize: 14,
    color: '#333',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  noVotersText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    padding: 16,
  },
});

export default PollMessage;
