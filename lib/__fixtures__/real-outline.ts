/**
 * Text from a real unit outline (Swinburne COS20007, SP Feb 2026), pasted the
 * way a PDF reader gives it up.
 *
 * Kept verbatim, warts included, because every one of the parser's early
 * failures came from something in here that no invented fixture had:
 *
 * - a five-digit unit code (COS20007), where the first regex assumed four
 * - the code and title in a label/value summary table, not on one line
 * - an assessment table whose rows are separated by single spaces, so the
 *   "this line was a table row" signal from column gaps is absent
 * - bulleted SUB-ROWS (`• W2 tasks 4%`) that break down a parent row's 40%
 *   rather than being assessments of their own
 * - pages of prose full of percentages: grading bands, attendance thresholds,
 *   "an extra 50% duration", "at least 50% of the quiz reflection"
 * - a `Total 100%` footer row
 */
export const REAL_OUTLINE = `Department of Computer and Software Engineering
Unit Outline
COS20007
Object Oriented Programming
Study Period Feb 2026

PART A: Unit Summary
Unit Code(s) COS20007
Unit Title Object Oriented Programming
Duration One semester
Total Contact Hours 36 hours
Credit Points 12.5 Credit Points
Campus/Location BUC - Doha
Mode of Delivery On Campus
Assessment Summary
In-Class Assessment required pre-class preparation 40%,
Mid-Semester Test 10%,
Major Assignment 30%, and
Final-Semester Test 20%.
Hurdle of (i) achieving an aggregate mark of 50% or
more, and (ii) passing the final-semester test

Learning and Teaching Structure
Category Activity Total Hours Hours per Week Teaching Period Weeks
On-campus Lecture 12 hours 1 hours Weeks 1 to 12
On-campus Class 24 hours 2 hours Weeks 1 to 12
Lab preparation Independent Learning 102 hours 8 hours Weeks 1 to 12

Assessment
a) Assessment overview
Tasks and Details Individual or Group Weighting Mapped Unit Learning Outcomes (ULO) Mapped Graduate Attributes Assessment Due Date
Weekly in-class tasks Individual 40% ULOs 1,2,3,4,5 GA5, GA6 Weekly assessment
• W2 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 2
• W3 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 3
• W4 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 4
• W5 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 5
• W6 task Individual 2% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 6
• W7 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 7
• W8 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 8
• W9 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 9
• W10 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 10
• W11 tasks Individual 4% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 11
• W12 task Individual 2% ULOs 1,2,3,4,5 GA5, GA6 In-class Week 12
In-class mid-term Test Individual 10% ULOs 1,2,3,4,5 GA5 In-class Week 6
In-class final Test Individual 20% ULOs 1,2,3,4,5 GA5 In-class Week 12
Assignment Interview Individual 30% ULOs 1,2,3,4,5 GA5, GA6 Week 13
Total 100%

b) Assessment requirement
See next page for Assessment Requirement and Details and Tips to maximize your mark

Weekly in-class tasks
Total: Aggregated up to 40 marks.
Grading Criteria
Your lab mark will be determined as follows:
• 0% – If you fail to attend the lab without special consideration. Marks will be available on Canvas for each corresponding lab task.
• 0% – If you complete the weekly lab tasks but fail to complete the verification task and do not attend the interview.
• 10% – 50% – If you partially complete the weekly lab tasks, partially or fully complete the verification task, and partially answer a few interview questions.
• 50% – 70% – If you fully complete both the weekly lab task and verification task but can only partially answer the interview questions.
• 100% – If you fully complete both the weekly lab tasks and verification task and correctly answer all interview questions.
Preparation Tips
• To unlock the upcoming week's lab tasks and lecture content, you must complete at least 50% of the quiz reflection for the current week.

In-class Mid-term Test
Total: 10 marks.
The mid-term test will take place during your Week 6 lab session.
Custom Project Total:
30 marks.
To be eligible to register for a custom project, you must attend more than 50% of the total weekly lab sessions.
• Fundamental – up to 15 marks
• Intermediate – up to 18 marks
• Advanced – up to 21 marks
• Challenging – up to 30 marks

Additional Support for Students with an Education Plan
Students with an Education Plan will be granted an extra 50% duration for both the mid-term and final tests.

Recommended Reading Materials
Lecture notes can be downloaded from the Canvas web site.
Budd, An Introduction to Object Oriented Programming, Addison-Wesley, 2002
Gamma et al., Design Patterns: Elements of Reusable Object-oriented Software, Addison-Wesley, 1994
Helpful information on referencing can be found at http://www.swinburne.edu.au/library/referencing/
`;
