from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def generate_streaming_response(messages):

    stream = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=messages,
        stream=True
    )

    for chunk in stream:

        content = chunk.choices[0].delta.content

        if content:
            yield content