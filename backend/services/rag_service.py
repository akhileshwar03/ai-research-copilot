from langchain_text_splitters import (
    RecursiveCharacterTextSplitter
)

from langchain_openai import OpenAIEmbeddings

from pypdf import PdfReader

from db.chroma import collection

from core.config import (
    OPENAI_API_KEY
)

import uuid
import os

embeddings = OpenAIEmbeddings(
    api_key=OPENAI_API_KEY
)

UPLOADS_DIR = "uploads"

def process_pdf(
    filename: str
):

    filepath = os.path.join(
        UPLOADS_DIR,
        filename
    )

    reader = PdfReader(
        filepath
    )

    text = ""

    for page in reader.pages:

        extracted = (
            page.extract_text()
        )

        if extracted:

            text += extracted

    splitter = (
        RecursiveCharacterTextSplitter(
            chunk_size=700,
            chunk_overlap=120,
        )
    )

    chunks = splitter.split_text(
        text
    )

    vectors = embeddings.embed_documents(
        chunks
    )

    ids = [
        str(uuid.uuid4())
        for _ in chunks
    ]

    collection.add(
        ids=ids,
        documents=chunks,
        embeddings=vectors,
        metadatas=[
            {
                "source": filename,
                "chunk": i
            }
            for i in range(len(chunks))
        ]
    )

def retrieve_context(
    query: str,
    filename: str | None = None,
):

    query_embedding = (
        embeddings.embed_query(
            query
        )
    )

    query_args = {
        "query_embeddings": [
            query_embedding
        ],
        "n_results": 6,
    }

    if filename:

        query_args["where"] = {
            "source": filename
        }

    results = collection.query(
        **query_args
    )

    documents = results[
        "documents"
    ][0]

    metadatas = results[
        "metadatas"
    ][0]

    formatted_chunks = []

    for i, doc in enumerate(
        documents
    ):

        source = metadatas[i][
            "source"
        ]

        chunk_number = (
            metadatas[i][
                "chunk"
            ]
        )

        formatted_chunks.append(
            f"""
        [SOURCE: {source} | CHUNK: {chunk_number}]

        {doc}
        """
        )

    unique_sources = list(
        set(
            [
                metadata["source"]
                for metadata in metadatas
            ]
        )
    )

    return {
        "context":
            "\n\n".join(
                formatted_chunks
            ),

        "sources":
            unique_sources,
    }