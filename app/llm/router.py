from typing import List, Dict, Any
from app.llm.base import BaseLLMProvider, LLMResponse

class LLMRouter:
    def __init__(self, providers: List[BaseLLMProvider]):
        self.providers = providers

    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        last_error = None
        for provider in self.providers:
            try:
                print(f"[Router] Attempting inference with [{provider.name} - {provider.model_name}]...")
                response = provider.generate(messages, system_instruction, tools)
                print(f"[Router] Success with [{provider.name}]!")
                return response
            except Exception as e:
                print(f"[Router Warning] Provider {provider.name} failed: {e}. Trying next fallback...")
                last_error = e

        raise RuntimeError(f"All LLM providers failed! Last error: {last_error}")
