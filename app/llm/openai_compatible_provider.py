from typing import List, Dict, Any
import json
from openai import OpenAI
from app.llm.base import BaseLLMProvider, LLMResponse, ToolCall

class OpenAICompatibleProvider(BaseLLMProvider):
    def __init__(self, name: str, base_url: str, api_key: str, model_name: str):
        super().__init__(name=name, model_name=model_name, api_key=api_key)
        self.client = OpenAI(base_url=base_url, api_key=api_key)

    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        # 1. Format tools for OpenAI schema
        openai_tools = []
        for tool in tools:
            openai_tools.append({
                "type": "function",
                "function": {
                    "name": tool["name"],
                    "description": tool["description"],
                    "parameters": tool.get("parameters", {"type": "object", "properties": {}})
                }
            })

        # 2. Build message list with system prompt
        formatted_messages = [{"role": "system", "content": system_instruction}]
        for msg in messages:
            formatted_messages.append({
                "role": msg["role"],
                "content": str(msg["content"])
            })

        # 3. Call OpenAI / Groq / OpenRouter API
        kwargs = {
            "model": self.model_name,
            "messages": formatted_messages,
            "temperature": 0.1,
        }
        if openai_tools:
            kwargs["tools"] = openai_tools
            kwargs["tool_choice"] = "auto"

        response = self.client.chat.completions.create(**kwargs)
        choice = response.choices[0].message

        # 4. Parse tool calls
        tool_calls = []
        if choice.tool_calls:
            for tc in choice.tool_calls:
                args = json.loads(tc.function.arguments) if isinstance(tc.function.arguments, str) else tc.function.arguments
                tool_calls.append(ToolCall(name=tc.function.name, args=args))

        return LLMResponse(
            text=choice.content,
            tool_calls=tool_calls,
            provider_name=self.name,
            model_name=self.model_name
        )
