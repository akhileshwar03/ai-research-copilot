from dotenv import load_dotenv
import os
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import PyPDFLoader
load_dotenv()
embedding_model = OpenAIEmbeddings(
    model="text-embedding-3-small"
)

text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200
)

VECTOR_DB_PATH = "chroma_db"

def ingest_pdf(file_path):

    loader = PyPDFLoader(file_path)

    documents = loader.load()

    split_docs = text_splitter.split_documents(
        documents
    )

    Chroma.from_documents(
        documents=split_docs,
        embedding=embedding_model,
        persist_directory=VECTOR_DB_PATH
    )

def retrieve_context(query):

    vectorstore = Chroma(
        persist_directory=VECTOR_DB_PATH,
        embedding_function=embedding_model
    )

    retriever = vectorstore.as_retriever(
        search_kwargs={"k": 4}
    )

    retrieved_docs = retriever.invoke(query)

    context = "\n\n".join(
        [doc.page_content for doc in retrieved_docs]
    )

    return context