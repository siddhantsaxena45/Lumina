import uvicorn
import os
import io
import json
import tempfile
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
import edge_tts
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from typing import Optional
from google import genai
from google.genai import types
from google.genai.errors import APIError
import asyncio

load_dotenv()

AI_SERVICE_PORT = int(os.getenv("PORT", os.getenv("AI_SERVICE_PORT", 8000)))
GEMINI_MODEL_NAME = "gemini-2.5-flash"

app = FastAPI(title="AI Interviewer Microservice", version="1.0")

origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Key Rotation Logic ---
class RotatingGeminiClient:
    def __init__(self):
        self.clients = []
        self.current_index = 0
        
        # Load up to 10 keys
        for i in range(1, 11):
            key = os.getenv(f"GOOGLE_API_KEY{i}")
            if key:
                self.clients.append(genai.Client(api_key=key))
        
        if not self.clients:
            print("WARNING: No GOOGLE_API_KEYs found in environment!")
            
    def get_client(self):
        if not self.clients:
            raise HTTPException(status_code=500, detail="Gemini API keys not configured.")
        client = self.clients[self.current_index]
        self.current_index = (self.current_index + 1) % len(self.clients)
        return client

gemini_manager = RotatingGeminiClient()

async def generate_with_retry(client=None, client_manager=None, **kwargs):
    max_retries = 10
    current_client = client or (client_manager.get_client() if client_manager else None)
    if not current_client:
        raise ValueError("Either client or client_manager must be provided")

    for attempt in range(max_retries):
        try:
            return await current_client.aio.models.generate_content(**kwargs)
        except APIError as e:
            if attempt < max_retries - 1 and e.code in [429, 503]:
                if e.code == 429 and client_manager:
                    print("Rotating API key due to 429 Too Many Requests...")
                    current_client = client_manager.get_client()
                    await asyncio.sleep(0.5)
                else:
                    print(f"Gemini API Error (Code {e.code}). Retrying in {2 ** attempt}s...")
                    await asyncio.sleep(2 ** attempt)
            else:
                raise

# --- Request / Response Models ---
class QuestionResquest(BaseModel):
    job_description: str
    resume_text: str
    count: int = 5
    round_type: str = "tech-1"

class NextQuestionRequest(BaseModel):
    job_description: str
    resume_text: str
    round_type: str
    previous_question: str
    user_answer: Optional[str] = None
    user_code: Optional[str] = None
    ai_feedback: str

class QuestionResponse(BaseModel):
    questions: list[str]
    jd_summary: str
    company_name: str
    ats_score: int
    model_used: str

class EvaluationRequest(BaseModel):
    question: str
    question_type: str
    job_description: str
    resume_text: str
    user_answer: Optional[str] = None
    user_code: Optional[str] = None

class EvaluationResponse(BaseModel):
    technicalScore: int
    confidenceScore: int
    aiFeedback: str
    idealAnswer: str

class SessionSummary(BaseModel):
    role: str
    technicalScore: int
    confidenceScore: int
    aiFeedback: str

class ProfileAnalysisRequest(BaseModel):
    history: list[SessionSummary]

class ProfileAnalysisResponse(BaseModel):
    summary: str
    recommendation: str

@app.get("/")
async def root():
    return {"message": "Hello from AI Interviewer Microservice !", "model": GEMINI_MODEL_NAME}


@app.post("/generate-questions", response_model=QuestionResponse)
async def generate_questions(request: QuestionResquest):
    try:
        if request.round_type == "hr":
            instruction = (
                "All questions MUST be HR / Behavioral / Fit interview questions. "
                "Act as a hiring manager. Ask questions that require the candidate to use the STAR framework "
                "or general behavioral questions based on the candidate's resume and job description. "
                "Do NOT generate any technical coding or implementation challenges."
            )
        elif request.round_type == "tech-1":
            instruction = (
                f"All {request.count} questions MUST be coding challenges (DSA or Full Stack) requiring function implementation, "
                f"tailored to the Job Description."
            )
        else: # tech-2
            instruction = "All questions MUST be conceptual oral questions on core subjects (OOPs, DBMS, etc.), resume deep dive, or puzzles. Do Not generate any coding or implementation challenges."

        system_instruction = (
            "You are an expert technical interviewer and recruiter. "
            "Task: Generate interview questions AND evaluate the candidate's resume against the Job Description. "
            "CRITICAL: Do NOT include any introductory phrases like 'To help you understand...' or 'Here is a question:'. "
            "CRITICAL: Start immediately with the question body. "
            f"Instructions: {instruction} "
            "Respond ONLY with a JSON object containing: "
            "1. 'questions' (array of strings) "
            "2. 'jd_summary' (a very brief 1-sentence summary of the Job Description) "
            "3. 'company_name' (Extract the company name from the JD, or 'Unknown Company' if missing) "
            "4. 'ats_score' (integer 0-100 indicating how well the resume matches the JD)."
        )

        user_prompt = (
            f"Generate exactly {request.count} unique, comprehensive interview questions for a candidate based on this Job Description:\n{request.job_description}\n\nAnd this Resume:\n{request.resume_text}\n\n"
            "Preserve all necessary code context or scenario details within the single question string."
        )
        
        response = await generate_with_retry(
            client_manager=gemini_manager,
            model=GEMINI_MODEL_NAME,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.6,
                response_mime_type="application/json",
            )
        )

        response_text = response.text.strip()
        response_data = json.loads(response_text)

        questions = response_data.get('questions', [])
        
        # Fallback if AI didn't return an array but a string
        if isinstance(questions, str):
            questions = [questions]
            
        clean_questions = []
        for q in questions:
            if isinstance(q, dict):
                clean_questions.append(q.get('question') or q.get('text') or list(q.values())[0])
            else:
                clean_questions.append(str(q))
            
        return QuestionResponse(
            questions=clean_questions[:request.count],
            jd_summary=response_data.get('jd_summary', 'No summary provided.'),
            company_name=response_data.get('company_name', 'Unknown Company'),
            ats_score=int(response_data.get('ats_score', 0)),
            model_used=GEMINI_MODEL_NAME
        )

    except Exception as e:
        print(f"generate_questions error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@app.post("/generate-next-question")
async def generate_next_question(request: NextQuestionRequest):
    try:
        system_instruction = (
            "You are a professional technical interviewer. "
            "Task: Generate ONE follow-up interview question based on the candidate's last answer. "
            "If the answer was poor, ask a simpler follow-up. If it was good, challenge them with something advanced. "
            "CRITICAL: Do NOT include any conversational filler (e.g. 'Good job!', 'Interesting approach...'). "
            "CRITICAL: Start immediately with the question body. "
            "Respond ONLY with a JSON object: {'question': 'text', 'questionType': 'oral' | 'coding'}"
        )

        user_prompt = (
            f"Job Description:\n{request.job_description}\n\nResume:\n{request.resume_text}\n"
            f"Round Type: {request.round_type}\n"
            f"Previous Question: {request.previous_question}\n"
            f"Candidate's Answer: {request.user_answer or 'None'}\n"
            f"Candidate's Code: {request.user_code or 'None'}\n"
            f"Evaluation: {request.ai_feedback}\n"
            "Ask the next question now."
        )

        response = await generate_with_retry(
            client_manager=gemini_manager,
            model=GEMINI_MODEL_NAME,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.7,
                response_mime_type="application/json",
            )
        )

        response_text = response.text.strip()
        next_q_data = json.loads(response_text)

        return {"question": next_q_data.get('question', ""), "questionType": next_q_data.get('questionType', 'oral')}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    temp_audio_path = None
    try:
        client = gemini_manager.get_client()
        
        # Save uploaded file temporarily
        audio_bytes = await file.read()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
            temp_audio_path = tmp.name
            tmp.write(audio_bytes)
        
        # Upload to Gemini API
        uploaded_file = await client.aio.files.upload(file=temp_audio_path)
        
        system_instruction = "You are an expert audio transcriptionist. Your ONLY job is to transcribe the spoken words in the audio file."
        user_prompt = "Transcribe the exact words spoken in this audio file. Output nothing else. Do not add formatting like quotes."
        
        response = await generate_with_retry(
            client=client,
            model=GEMINI_MODEL_NAME,
            contents=[uploaded_file, user_prompt],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1
            )
        )
        
        transcription = response.text.strip()
        
        # Clean up the file from Gemini and local
        await client.aio.files.delete(name=uploaded_file.name)
        os.remove(temp_audio_path)
        
        return {"transcription": transcription}

    except Exception as e:
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        raise HTTPException(status_code=500, detail=str(e))

class EvaluationResponseWithTranscription(BaseModel):
    technicalScore: int
    confidenceScore: int
    aiFeedback: str
    idealAnswer: str
    transcription: str = ""

@app.post("/evaluate")
async def evaluate(
    job_description: str = Form(...),
    resume_text: str = Form(...),
    question: str = Form(...),
    question_type: str = Form("oral"),
    round_type: str = Form("tech-1"),
    user_answer: str = Form(""),
    user_code: str = Form(""),
    audioFile: UploadFile = File(None)
):
    temp_audio_path = None
    uploaded_file = None
    try:
        client = gemini_manager.get_client()
        contents_list = []
        
        if audioFile and audioFile.filename:
            audio_bytes = await audioFile.read()
            if audio_bytes:
                with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp:
                    temp_audio_path = tmp.name
                    tmp.write(audio_bytes)
                uploaded_file = await client.aio.files.upload(file=temp_audio_path)
                contents_list.append(uploaded_file)
        
        if round_type == "hr":
            assessment_instruction = (
                "This is a Behavioral/HR interview question. Evaluate the candidate's answer STRICTLY using the STAR framework "
                "(Situation, Task, Action, Result). Did they provide a concrete example? Penalize vague answers. "
                "CRITICAL: If the transcript/audio is empty, nonsense or irrelevant, SCORE 0.\n"
                "RULE 2: For 'idealAnswer', it is STRICTLY FORBIDDEN to output more than 2 short sentences. Provide a clean, extremely brief summary. No lists. No bullet points. Do NOT return a nested JSON object."
            )
        elif question_type == "oral":
            assessment_instruction = (
                "This is a conceptual oral question. Focus on the candidate's explanation. "
                "CRITICAL: If the transcript/audio is empty, nonsense or irrelevant, SCORE 0.\n"
                "RULE 2: For 'idealAnswer', it is STRICTLY FORBIDDEN to output more than 2 short sentences. Provide a clean, extremely brief summary. No lists. No bullet points. Do NOT return a nested JSON object."
            )
        else:
            assessment_instruction = (
                "This is a coding challenge question. Evaluate the code logic and efficiency. "
                "Use the verbal explanation for insight into their thought process. "
                "CRITICAL: If the code is 'undefined', empty, just random comments, or random characters, SCORE 0.\n"
                "RULE 2: For 'idealAnswer', you MUST provide the correct optimal code solution in a code block. Keep any text explanation to an absolute minimum (1 sentence max). Do NOT return a nested JSON object."
            )
        
        system_instruction = (
            "You are a strict technical/HR interviewer with an advanced multi-modal audio model. "
            "Your tasks:\n"
            "1. Transcribe the audio exactly if provided.\n"
            "2. Evaluate the answer based on transcript and code (if applicable).\n"
            "3. Evaluate the confidenceScore (0-100) strictly based on vocal delivery in the audio: pacing, tone, hesitations (umm, ahh). If no audio, use the text transcript.\n"
            "RULE 1: If the answer is gibberish, irrelevant, or missing, return 'technicalScore':0 and 'confidenceScore':0.\n"
            f"Context: {assessment_instruction}"
        )
        
        user_prompt = (
            f"Job Description:\n{job_description}\n"
            f"Resume:\n{resume_text}\n"
            f"Question: {question}\n"
            f"Verbal Answer Text Fallback: {user_answer}\n"
            f"Code Answer: {user_code}\n"
            "Return JSON matching: technicalScore, confidenceScore, aiFeedback, idealAnswer, transcription (if audio was provided)."
        )
        
        contents_list.append(user_prompt)
        
        response = await generate_with_retry(
            client=client,
            model=GEMINI_MODEL_NAME,
            contents=contents_list,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                response_mime_type="application/json",
                response_schema={
                    "type": "OBJECT",
                    "properties": {
                        "technicalScore": {"type": "INTEGER"},
                        "confidenceScore": {"type": "INTEGER"},
                        "aiFeedback": {"type": "STRING"},
                        "idealAnswer": {"type": "STRING"},
                        "transcription": {"type": "STRING"}
                    },
                    "required": ["technicalScore", "confidenceScore", "aiFeedback", "idealAnswer", "transcription"]
                }
            )
        )
        
        if uploaded_file:
            await client.aio.files.delete(name=uploaded_file.name)
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
            
        response_text = response.text.strip()
        evaluation_data = json.loads(response_text)
                
        if 'idealAnswer' in evaluation_data and not isinstance(evaluation_data['idealAnswer'], str):
            evaluation_data['idealAnswer'] = json.dumps(evaluation_data['idealAnswer'])
            
        return EvaluationResponseWithTranscription(**evaluation_data)

    except Exception as e:
        if uploaded_file:
            try:
                await client.aio.files.delete(name=uploaded_file.name)
            except: pass
        if temp_audio_path and os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
        print(f"Failed to generate response: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        

class TTSRequest(BaseModel):
    text: str

@app.post("/tts")
async def generate_tts(request: TTSRequest):
    try:
        voice = "en-US-AriaNeural"
        communicate = edge_tts.Communicate(request.text, voice)
        
        async def generate():
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
                    
        return StreamingResponse(generate(), media_type="audio/mpeg")
    except Exception as e:
        print(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-profile", response_model=ProfileAnalysisResponse)
async def analyze_profile(request: ProfileAnalysisRequest):
    if not request.history:
        return ProfileAnalysisResponse(
            summary="You haven't completed any interviews yet. Complete your first interview to generate an AI performance analysis.",
            recommendation="Start an interview from your Dashboard to get personalized feedback on your technical and communication skills."
        )

    system_instruction = (
        "You are an expert technical recruiter and career coach analyzing a candidate's past interview performance. "
        "Review the provided array of past interview scores and feedback. "
        "Your task:\n"
        "1. Write a 1-sentence 'summary' capturing their overall trajectory and primary strengths or recurring weaknesses.\n"
        "2. Write a 1-sentence 'recommendation' offering actionable, specific advice for their next interview.\n"
        "CRITICAL: Keep responses extremely concise. Do NOT use bullet points. Do NOT be overly generic."
    )
    
    prompt = f"Candidate History:\n{json.dumps([h.model_dump() for h in request.history], indent=2)}"
    
    last_exception = None
    for attempt in range(len(gemini_manager.clients)):
        try:
            client = gemini_manager.get_client()
            response = await client.aio.models.generate_content(
                model=GEMINI_MODEL_NAME,
                contents=[prompt],
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
                    response_mime_type="application/json",
                    response_schema=ProfileAnalysisResponse,
                    temperature=0.3
                )
            )
            
            result_json = response.text
            parsed_data = json.loads(result_json)
            return ProfileAnalysisResponse(**parsed_data)
            
        except Exception as e:
            gemini_manager.rotate_key()
            last_exception = e
            print(f"Gemini API Error in /analyze-profile (attempt {attempt + 1}): {e}")

    raise HTTPException(status_code=500, detail="AI service unavailable after multiple retries.")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=AI_SERVICE_PORT)
