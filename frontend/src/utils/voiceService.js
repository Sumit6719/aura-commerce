export class VoiceService {
  constructor() {
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.voice = null;
    
    // Initialize SpeechRecognition (support both standard and webkit prefixes)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }

    // Load voices
    if (this.synthesis) {
      this.synthesis.onvoiceschanged = () => {
        const voices = this.synthesis.getVoices();
        // Prioritize Indian English (en-IN) as it natively handles Hinglish/Kanglish and transliterated Latin script perfectly
        this.voice = voices.find(v => v.lang === 'en-IN' && v.name.includes('Female'))
                  || voices.find(v => v.lang === 'en-IN')
                  || voices.find(v => v.name.includes('Google UK English Female')) 
                  || voices.find(v => v.name.includes('Samantha')) 
                  || voices.find(v => v.lang === 'en-US' && v.name.includes('Female'))
                  || voices[0];
      };
    }
  }

  isSupported() {
    return !!this.recognition && !!this.synthesis;
  }

  startListening(onResult, onError, onEnd) {
    if (!this.recognition) {
      if (onError) onError('Speech recognition not supported in this browser.');
      return;
    }

    this.recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (onResult) onResult(transcript);
    };

    this.recognition.onerror = (event) => {
      if (onError) onError(event.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (onEnd) onEnd();
    };

    try {
      this.recognition.start();
      this.isListening = true;
    } catch (e) {
      if (onError) onError(e.message);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
    }
  }

  speak(text, onEnd) {
    if (!this.synthesis) return;
    
    this.stopSpeaking(); // Cancel any ongoing speech

    const cleanedText = this.cleanMarkdownForSpeech(text);
    if (!cleanedText.trim()) {
       if (onEnd) onEnd();
       return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanedText);
    if (this.voice) {
      utterance.voice = this.voice;
    }
    
    // Adjust pitch and rate for a more natural assistant voice
    utterance.pitch = 1.0;
    utterance.rate = 1.05;

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      if (onEnd) onEnd();
    };

    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  cleanMarkdownForSpeech(text) {
    let clean = text;

    // Handle payment link text specifically based on the prompt instructions
    const markdownLinkMatch = clean.match(/\[(.*?)\]\((https?:\/\/[^\s)]+)\)/);
    if (markdownLinkMatch) {
      // Replaces the URL rendering with natural spoken text
      clean = clean.replace(markdownLinkMatch[0], '. Your payment link has been generated and is available in the chat.');
    }
    
    const rawMatch = clean.match(/(https?:\/\/[^\s)\]*"']+)/);
    if (rawMatch) {
       clean = clean.replace(rawMatch[0], '. Your payment link has been generated and is available in the chat.');
    }

    // Strip common markdown characters
    clean = clean.replace(/[#*`_~>]/g, '');
    
    // Convert multiple newlines/spaces to a single space
    clean = clean.replace(/\n/g, '. ').replace(/\s{2,}/g, ' ');

    return clean.trim();
  }
}

// Export a singleton instance
export const voiceService = new VoiceService();
