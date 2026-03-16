import os
import shutil
import warnings
import io
from fastapi.responses import StreamingResponse
from gtts import gTTS
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Suppress warnings for a cleaner terminal
warnings.filterwarnings("ignore", category=UserWarning)

# LangChain Imports
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

app = FastAPI(title="Inclusive Citizen API")

# Configure CORS for Next.js
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Initialize the Embedding Model
print("Loading embedding model...")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 2. Define FAISS Index Path
FAISS_INDEX_PATH = "./faiss_index"

# Temporary directory to hold uploaded PDFs
os.makedirs("uploads", exist_ok=True)

# --- Admin Authentication Setup ---
# For a hackathon, hardcoding is fine. In production, these go in your .env file!
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "password123"

class LoginRequest(BaseModel):
    username: str
    password: str

@app.post("/api/admin/login")
async def login(request: LoginRequest):
    if request.username == ADMIN_USERNAME and request.password == ADMIN_PASSWORD:
        # Return a simple dummy token to prove authentication works
        return {"token": "secure_hackathon_token_2026"}
    else:
        raise HTTPException(status_code=401, detail="Invalid username or password")

@app.get("/api/admin/files")
async def get_uploaded_files():
    try:
        # Read the uploads directory
        files = os.listdir("uploads")
        # Filter to only show PDF documents (hides the temp audio files)
        pdf_files = [f for f in files if f.endswith(".pdf")]
        return {"files": pdf_files}
    except Exception as e:
        return {"files": []}

@app.delete("/api/admin/files/{filename}")
async def delete_file(filename: str):
    file_path = f"uploads/{filename}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        # 1. Delete the physical PDF file
        os.remove(file_path)
        
        # 2. Wipe the AI's memory (Delete the FAISS index directory)
        if os.path.exists(FAISS_INDEX_PATH):
            shutil.rmtree(FAISS_INDEX_PATH)
            
        # 3. Check what files are left
        remaining_files = [f for f in os.listdir("uploads") if f.endswith(".pdf")]
        
        # 4. Rebuild the memory if there are still files left
        if remaining_files:
            all_chunks = []
            for file in remaining_files:
                loader = PyPDFLoader(f"uploads/{file}")
                documents = loader.load()
                text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=100)
                chunks = text_splitter.split_documents(documents)
                all_chunks.extend(chunks)
            
            # Create a brand new, clean database
            vector_store = FAISS.from_documents(all_chunks, embeddings)
            vector_store.save_local(FAISS_INDEX_PATH)
            
        return {"message": f"Successfully deleted {filename} and refreshed the AI's knowledge base!"}
        
    except Exception as e:
        print(f"🔥 DELETE ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

@app.post("/api/admin/upload")
async def upload_pdf(file: UploadFile = File(...)):
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    file_path = f"uploads/{file.filename}"
    
    # Save the file temporarily
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        # 3. Extract Text from PDF
        loader = PyPDFLoader(file_path)
        documents = loader.load()
        
        # 4. Split Text into Manageable Chunks
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, 
            chunk_overlap=100
        )
        chunks = text_splitter.split_documents(documents)
        
        # 5. Store Embeddings in FAISS
        if os.path.exists(FAISS_INDEX_PATH):
            # Load existing database and add new chunks
            vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
            vector_store.add_documents(chunks)
            vector_store.save_local(FAISS_INDEX_PATH)
        else:
            # Create a new database if one doesn't exist
            vector_store = FAISS.from_documents(chunks, embeddings)
            vector_store.save_local(FAISS_INDEX_PATH)
        
        return {
            "filename": file.filename, 
            "message": f"Successfully processed {len(chunks)} text chunks into the FAISS database!"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing document: {str(e)}")
    
# Data model for testing retrieval
class QueryRequest(BaseModel):
    query: str

@app.post("/api/chat/test_retrieval")
async def test_retrieval(request: QueryRequest):
    if not os.path.exists(FAISS_INDEX_PATH):
        raise HTTPException(status_code=400, detail="No documents uploaded yet. Please upload a PDF first.")
        
    # Load the FAISS database and search
    vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
    results = vector_store.similarity_search(request.query, k=3)
    
    retrieved_text = [doc.page_content for doc in results]
    return {"query": request.query, "retrieved_chunks": retrieved_text}



import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser

# Load environment variables (API Key)
load_dotenv()

# Initialize the LLM Placeholder (You can swap this for any regional API later)
# Using GPT-3.5/4o-mini is cost-effective and highly multilingual for the prototype
llm = ChatGroq(
    model_name="llama-3.3-70b-versatile", 
    temperature=0.2
)

# --- 1. The Language Router Mapping ---
# --- 1. The Language Router Mapping ---
LANGUAGE_MAP = {
    "en": "English",
    "ms": "Bahasa Melayu (Malay)",
    "ms-kl": "Bahasa Melayu (Kelantanese Dialect)",
    "zh": "Chinese (Mandarin)",
    "ta": "Tamil",
    "th": "Thai",
    "vi": "Vietnamese",
    "id-jv": "Bahasa Indonesia (Javanese Dialect)",
    "tl-cb": "Filipino (Cebuano Dialect)"
}

# --- 2. The Strict System Prompt (Anti-Hallucination + Greeting) ---
prompt_template = """
You are an inclusive public service assistant for the ASEAN region. 
Your sole purpose is to help citizens understand the provided official government documents.

CRITICAL INSTRUCTIONS:
1. GREETINGS: If the User Question is a simple greeting (e.g., "hi", "hello", "good morning"), respond warmly in {language} and ask how you can help them with public services today. Do NOT output bullet points for greetings.
2. For all other questions, you MUST ONLY use the provided Context to answer.
3. If the answer is NOT explicitly contained in the Context, you MUST refuse to answer and output exactly: "I am sorry, but I can only answer questions related to the uploaded official documents. The information you requested is not available."
4. Do NOT use your general knowledge, and do NOT hallucinate information under any circumstances.
5. Translate your final answer strictly into {language}.
6. Simplify all legal, medical, or complex official jargon to a 5th-grade reading level.
7. If you have an answer from the context, format your response strictly as 3 to 5 highly actionable bullet points. Do not write long paragraphs.

Context: 
{context}

User Question: 
{question}

Answer in {language}:
"""
prompt = PromptTemplate.from_template(prompt_template)

# --- 3. The Chat Endpoint ---
class ChatRequest(BaseModel):
    query: str
    language_code: str  # Will receive "en", "ms", "th", etc. from your dropdown

class TTSRequest(BaseModel):
    text: str
    language_code: str

@app.post("/api/chat/text")
async def chat_text(request: ChatRequest):
    if not os.path.exists(FAISS_INDEX_PATH):
        raise HTTPException(status_code=400, detail="Knowledge base is empty. Please upload a PDF first.")
    
    target_language = LANGUAGE_MAP.get(request.language_code, "English")
    vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
    retriever = vector_store.as_retriever(search_kwargs={"k": 3})
    
    try:
        # 1. Manually retrieve the documents first
        docs = retriever.invoke(request.query)
        context_text = "\n\n".join(doc.page_content for doc in docs)
        
        # 2. Extract unique source filenames from the metadata
        sources = set()
        for doc in docs:
            if "source" in doc.metadata:
                # Extracts just the filename (e.g., 'guidelines.pdf' from 'uploads/guidelines.pdf')
                filename = os.path.basename(doc.metadata["source"])
                sources.add(filename)
        
        # 3. Format the prompt and invoke the LLM directly
        formatted_prompt = prompt.format(context=context_text, question=request.query, language=target_language)
        ai_response = llm.invoke(formatted_prompt).content
        
        return {
            "query": request.query,
            "language": target_language,
            "response": ai_response,
            "sources": list(sources) # <-- We are now sending the sources back!
        }
    except Exception as e:
        print(f"🔥 CRITICAL ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")

from fastapi import Form
from groq import Groq

# Initialize the standard Groq client for audio transcription
groq_client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

#Audio
@app.post("/api/chat/audio")
async def chat_audio(
    file: UploadFile = File(...), 
    language_code: str = Form(...)
):
    if not os.path.exists(FAISS_INDEX_PATH):
        raise HTTPException(status_code=400, detail="Knowledge base is empty.")
    
    # 1. Save the incoming audio blob temporarily
    temp_audio_path = f"uploads/temp_{file.filename}.webm"
    with open(temp_audio_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        # 2. Transcribe the audio using Groq's blazing-fast Whisper model
        with open(temp_audio_path, "rb") as audio_file:
            transcription = groq_client.audio.transcriptions.create(
                file=(temp_audio_path, audio_file.read()),
                model="whisper-large-v3",
                response_format="json",
            )
            
        user_spoken_text = transcription.text
        print(f"Transcribed Text: {user_spoken_text}")

        # 3. Route the transcribed text into our existing Phase 3 RAG Pipeline
        target_language = LANGUAGE_MAP.get(language_code, "English")
        
        vector_store = FAISS.load_local(FAISS_INDEX_PATH, embeddings, allow_dangerous_deserialization=True)
        retriever = vector_store.as_retriever(search_kwargs={"k": 3})
        
        # Manually retrieve the documents first
        docs = retriever.invoke(user_spoken_text)
        context_text = "\n\n".join(doc.page_content for doc in docs)
        
        # Extract unique source filenames from the metadata
        sources = set()
        for doc in docs:
            if "source" in doc.metadata:
                filename = os.path.basename(doc.metadata["source"])
                sources.add(filename)
        
        # Format the prompt and invoke the LLM directly
        formatted_prompt = prompt.format(context=context_text, question=user_spoken_text, language=target_language)
        ai_response = llm.invoke(formatted_prompt).content
        
        return {
            "transcribed_query": user_spoken_text,
            "language": target_language,
            "response": ai_response,
            "sources": list(sources) # <-- Now the frontend will get the audio sources!
        }
        
    except Exception as e:
        print(f"🔥 CRITICAL ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Audio Processing Error: {str(e)}")

# --- 5. Text-to-Speech Endpoint ---
@app.post("/api/chat/tts")
async def generate_tts(request: TTSRequest):
    # Map our app's specific language codes to gTTS supported codes
    gtts_lang_map = {
        "en": "en",
        "ms": "ms",
        "ms-kl": "ms", # Fallback to standard Malay
        "zh": "zh-CN",
        "ta": "ta",
        "th": "th",
        "vi": "vi",
        "id-jv": "id", # Fallback to standard Indonesian
        "tl-cb": "tl"  # Fallback to standard Tagalog
    }
    
    # Default to English if the code isn't found
    target_lang = gtts_lang_map.get(request.language_code, "en")
    
    try:
        # Generate the audio using Google's engine
        tts = gTTS(text=request.text, lang=target_lang, slow=False)
        
        # Save it to an in-memory byte buffer instead of a physical file to keep things fast
        audio_io = io.BytesIO()
        tts.write_to_fp(audio_io)
        audio_io.seek(0)
        
        # Stream the MP3 directly back to the browser
        return StreamingResponse(audio_io, media_type="audio/mpeg")
        
    except Exception as e:
        print(f"🔥 TTS ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate audio")