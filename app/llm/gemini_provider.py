from typing import List, Dict, Any
from google import genai
from google.genai import types
from app.llm.base import BaseLLMProvider, LLMResponse, ToolCall

class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model_name: str = "gemini-2.0-flash"):
        super().__init__(name="Gemini", model_name=model_name, api_key=api_key)
        self.client = genai.Client(api_key=api_key)

    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        # 1. Format Gemini tool declarations
        gemini_tools = []
        for tool in tools:
            func_decl = types.FunctionDeclaration(
                name=tool["name"],
                description=tool["description"],
                parameters=tool.get("parameters")
            )
            gemini_tools.append(types.Tool(function_declarations=[func_decl]))

        # 2. Convert standard messages to Gemini Content objects
        contents = []
        for msg in messages:
            role = "user" if msg["role"] in ["user", "tool"] else "model"
            if "parts" in msg:
                contents.append(types.Content(role=role, parts=msg["parts"]))
            else:
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=str(msg["content"]))]))

        # 3. Call Gemini
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=gemini_tools if gemini_tools else None,
            temperature=0.2,
        )

        response = self.client.models.generate_content(
            model=self.model_name,
            contents=contents,
            config=config
        )

        # 4. Extract Tool Calls if any
        tool_calls = []
        if response.function_calls:
            for call in response.function_calls:
                tool_calls.append(ToolCall(name=call.name, args=call.args))

        return LLMResponse(
            text=response.text,
            tool_calls=tool_calls,
            provider_name=self.name,
            model_name=self.model_name
        )
