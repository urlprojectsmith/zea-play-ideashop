import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage } from '../types';
import { ChatBubbleOvalLeftEllipsisIcon, XMarkIcon, PaperAirplaneIcon } from './icons';
import { BOT_ERROR_MESSAGE, generateSessionId, sendAiMessage } from '../utils/aiClient';

const Chatbot: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([
        { sender: 'bot', text: "Hello! I'm your AI assistant. How can I help you manage your tasks today?" }
    ]);
    const [userInput, setUserInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sessionId] = useState(generateSessionId());
    const messagesEndRef = useRef<null | HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages, isLoading]);

    const handleSendMessage = async () => {
        if (!userInput.trim()) return;

        const newUserMessage: ChatMessage = { sender: 'user', text: userInput };
        setMessages(prev => [...prev, newUserMessage]);
        const currentInput = userInput;
        setUserInput('');
        setIsLoading(true);

        try {
            const botReply = await sendAiMessage({
                message: currentInput,
                sessionId,
            });

            const newBotMessage: ChatMessage = { sender: 'bot', text: botReply };
            setMessages(prev => [...prev, newBotMessage]);
        } catch (error) {
            console.error('Error communicating with the chatbot webhook:', error);
            const errorMessage: ChatMessage = { sender: 'bot', text: BOT_ERROR_MESSAGE };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !isLoading) {
            handleSendMessage();
        }
    };

    return (
        <>
            {/* Chat Widget */}
            <div
                className={`fixed left-2 right-2 bottom-[calc(120px+env(safe-area-inset-bottom))] z-30 flex max-h-[calc(100vh-180px)] h-[68vh] w-auto flex-col rounded-lg border border-border-color bg-surface shadow-xl transition-all duration-300 ease-in-out sm:left-auto sm:right-6 sm:bottom-24 sm:h-[60vh] sm:max-h-[620px] sm:w-[24rem] ${
                    isOpen ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'
                }`}
            >
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center p-3 border-b border-border-color">
                    <h3 className="font-bold text-text-primary">AI Assistant</h3>
                    <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-white">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                    <div className="space-y-4">
                        {messages.map((msg, index) => (
                            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] sm:max-w-xs lg:max-w-md px-3 py-2 sm:px-4 rounded-lg ${msg.sender === 'user' ? 'bg-primary text-white' : 'bg-background'}`}>
                                    <p className="text-sm break-words">{msg.text}</p>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="bg-background px-4 py-2 rounded-lg">
                                    <div className="flex items-center space-x-1">
                                        <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></span>
                                        <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></span>
                                        <span className="h-2 w-2 bg-gray-400 rounded-full animate-pulse"></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>
                </div>

                {/* Input */}
                <div className="flex-shrink-0 border-t border-border-color p-2.5 sm:p-3 flex items-center">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder="Type a message..."
                        className="flex-1 rounded-l-md border border-border-color bg-background py-2 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        disabled={isLoading}
                    />
                    <button onClick={handleSendMessage} disabled={isLoading || !userInput.trim()} className="rounded-r-md bg-primary p-2.5 text-white disabled:opacity-50">
                        <PaperAirplaneIcon className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* FAB */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="chatbot-fab fixed right-3 bottom-[calc(84px+env(safe-area-inset-bottom))] md:right-6 md:bottom-6 z-30 flex items-center justify-center bg-transparent p-1 text-white transition-transform hover:scale-110"
                aria-label="Toggle AI Assistant"
            >
                <img
                    src="https://res.cloudinary.com/dqhcbck76/image/upload/v1770241421/chatbot_m60ya9.png"
                    alt="Chatbot"
                    className="h-12 w-12 object-contain sm:h-14 sm:w-14"
                />
            </button>
        </>
    );
};
export default Chatbot;





