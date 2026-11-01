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
        trace = []
        last_error = None
        for idx, provider in enumerate(self.providers):
            attempt_info = {
                "provider": provider.name,
                "model": provider.model_name,
                "tier": "Primary" if idx == 0 else f"Fallback #{idx}",
            }
            try:
                print(f"[Router] Attempting inference with [{provider.name} - {provider.model_name}]...")
                response = provider.generate(messages, system_instruction, tools)
                print(f"[Router] Success with [{provider.name}]!")
                attempt_info["status"] = "success"
                trace.append(attempt_info)
                response.routing_trace = trace
                return response
            except Exception as e:
                err_str = str(e)
                print(f"[Router Warning] Provider {provider.name} failed: {err_str}. Trying next fallback...")
                last_error = e
                is_rate_limit = any(k in err_str.lower() for k in ["429", "rate limit", "quota", "resource exhausted", "overloaded", "too many requests"])
                attempt_info["status"] = "failed"
                attempt_info["is_rate_limit"] = is_rate_limit
                attempt_info["error"] = err_str[:160]
                trace.append(attempt_info)

        raise RuntimeError(f"All LLM providers failed! Last error: {last_error}")
