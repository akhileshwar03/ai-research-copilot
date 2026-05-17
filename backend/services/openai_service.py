from openai import OpenAI
from dotenv import load_dotenv
import os

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def generate_chat_response(messages):

    response = client.chat.completions.create(
        model="gpt-4.1-mini",
        messages=messages
    )

    return response.choices[0].message.content