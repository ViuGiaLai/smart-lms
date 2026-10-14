from typing import List, Optional, Union
from pydantic import BaseModel, Field

class RubricCriteria(BaseModel):
    name: str = Field(description="Tên tiêu chí (ví dụ: 'Nắm vững kiến thức', 'Lập luận logic')")
    description: Optional[str] = Field(default="", description="Mô tả yêu cầu tiêu chí")
    max_score: float = Field(default=2.5, description="Điểm tối đa của tiêu chí")

class CriteriaScore(BaseModel):
    criteria_name: str = Field(description="Tên tiêu chí")
    criteria_description: Optional[str] = Field(default="", description="Mô tả tiêu chí")
    max_score: float = Field(description="Điểm tối đa")
    earned_score: float = Field(description="Điểm đạt được")
    comment: str = Field(default="", description="Nhận xét chi tiết")

class GradingRequest(BaseModel):
    student_answer: str = Field(..., description="Nội dung bài làm của học sinh")
    rubric: List[RubricCriteria] = Field(..., description="Bảng tiêu chí chấm điểm")
    question: Optional[str] = Field(default="", description="Đề bài câu hỏi")
    reference_answer: Optional[str] = Field(default="", description="Đáp án chuẩn của giảng viên")
    max_total_score: Optional[float] = Field(default=10.0, description="Tổng điểm tối đa")

class GradingResult(BaseModel):
    total_score: float = Field(description="Tổng điểm đạt được")
    max_total_score: float = Field(description="Tổng điểm tối đa")
    percentage: float = Field(description="Tỷ lệ % điểm đạt được")
    grade_level: str = Field(default="C", description="Xếp loại: A, B, C, D, F")
    criteria_scores: List[CriteriaScore] = Field(default_factory=list, description="Điểm chi tiết theo tiêu chí")
    overall_feedback: str = Field(default="", description="Đánh giá tổng quát toàn bài")
    strengths: List[str] = Field(default_factory=list, description="Điểm mạnh")
    improvements: List[str] = Field(default_factory=list, description="Điểm cần cải thiện")
