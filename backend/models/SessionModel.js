import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
    questionText:{
        type:String,
        required:true
    },
    questionType:{
        type:String,
        enum:["coding","oral"],
        required:true
    },
    idealAnswer:{
        type:String,
        default:"pending"
    },
    userAnswerText:{
        type:String,
        default:""
    },
    userSubmittedCode:{
        type:String,
        default:""
    },
    isSubmitted:{
        type:Boolean,
        default:false
    },
    isEvaluated:{
        type:Boolean,
        default:false
    },
    technicalScore:{
        type:Number,
        default:0
    },
    confidenceScore:{
        type:Number,
        default:0
    },
    aiFeedback:{
        type:String,
        default:"Not yet submitted or evaluated"
    }
});

const sessionSchema= new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    jobDescription: {
        type: String,
        required: true
    },
    resumeText: {
        type: String,
        required: true
    },
    roundType: {
        type: String,
        enum: ["tech-1", "tech-2", "hr"],
        required: true
    },
    jdSummary: {
        type: String,
        default: ""
    },
    companyName: {
        type: String,
        default: "Unknown Company"
    },
    atsScore: {
        type: Number,
        default: 0
    },
    duration: {
        type: Number, // in minutes
        required: true,
        default: 15
    },
    status:{
        type:String,
        enum:["pending","in-progress","completed","failed"],
        default:"pending"
    },
    overallScore: {
        type: Number,
        default: 0,
    },
    metrics: {
        avgTechnical: { type: Number, default: 0 },
        avgConfidence: { type: Number, default: 0 },
    },
    questions:[questionSchema],
    startTime:{type:Date, default: null},
    endTime:{type:Date},
    pauseTimeMS: { type: Number, default: 0 },
    isPaused: { type: Boolean, default: false },
    lastPauseStart: { type: Date },
    violations: {
        type: Number,
        default: 0
    }
   
},{
    timestamps:true
});

const Session = mongoose.model("Session", sessionSchema);
export default Session