from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class ToolCall(BaseModel):
    name: str
    args: Dict[str, Any]

class LLMResponse(BaseModel):
    text: Optional[str] = None
    tool_calls: List[ToolCall] = []
    provider_name: str
    model_name: str
    routing_trace: List[Dict[str, Any]] = []

class BaseLLMProvider(ABC):
    def __init__(self, name: str, model_name: str, api_key: str):
        self.name = name
        self.model_name = model_name
        self.api_key = api_key

    @abstractmethod
    def generate(
        self,
        messages: List[Dict[str, Any]],
        system_instruction: str,
        tools: List[Dict[str, Any]]
    ) -> LLMResponse:
        """
        Translates standardized messages and tools into provider format and returns LLMResponse.
        Raises an exception on rate-limit / failure to trigger fallback.
        """
        pass
