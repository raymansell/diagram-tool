import MarkdownRenderer from './MarkdownRenderer';
import type { UIMessage } from 'ai';
import ToolStatus from '../streaming/ToolStatus';
import '../streaming/streaming.css';

interface MessageBubbleProps {
  // The AI SDK message protocol:
  // {
  //   id: "msg-1",
  //   role: "assistant",
  //   parts: [
  //     { type: "text", text: "Sure, here is your diagram." },
  //     { type: "tool-generateDiagram", state: "output-available", input: {...}, output: {...} }
  //   ]
  // }
  message: UIMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <div className={`message-bubble ${message.role}`}>
      <div className='message-role'>
        {message.role === 'user' ? 'You' : 'Assistant'}
      </div>
      <div className='message-content'>
        {/* 
            Recall that messages are streaming in, we don't receive the full
            message at once, we receive "parts" or "chunks", each of potentially
            different type 
        */}
        {message.parts?.map((part, i) => {
          // Plain text part
          if (part.type === 'text') {
            if (message.role === 'assistant') {
              return <MarkdownRenderer key={i} content={part.text} />;
            }
            return <p key={i}>{part.text}</p>;
          }

          // Tool call part: type is `tool-<toolName>` (e.g. tool-generateDiagram)
          if (part.type?.startsWith('tool-')) {
            const toolName = part.type.replace('tool-', '');
            const toolPart = part as { state?: string };
            const status =
              toolPart.state === 'output-available'
                ? 'complete'
                : toolPart.state === 'output-error'
                  ? 'error'
                  : 'running';
            return <ToolStatus key={i} name={toolName} status={status} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}
