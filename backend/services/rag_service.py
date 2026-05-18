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
    for doc in split_docs:

        filename = file_path.split("/")[-1]
        doc.metadata["source"] = filename
        doc.metadata["document_id"] = filename

    Chroma.from_documents(
        documents=split_docs,
        embedding=embedding_model,
        persist_directory=VECTOR_DB_PATH
    )

def retrieve_context(
    query,
    document_id=None
):

    vectorstore = Chroma(
        persist_directory=VECTOR_DB_PATH,
        embedding_function=embedding_model
    )

    search_filter = None

    if document_id:

        search_filter = {
            "document_id": document_id
        }

    retriever = vectorstore.as_retriever(
        search_kwargs={
            "k": 4,
            "filter": search_filter
        }
    )

    retrieved_docs = retriever.invoke(query)

    context_parts = []

    sources = []

    for doc in retrieved_docs:

        source = doc.metadata.get(
            "source",
            "Unknown"
        )

        page = doc.metadata.get(
            "page",
            "N/A"
        )

        context_parts.append(
            f"""
Source: {source}
Page: {page}

Content:
{doc.page_content}
"""
        )

        sources.append({
            "source": source,
            "page": page
        })

    context = "\n\n".join(context_parts)

    return context, sources