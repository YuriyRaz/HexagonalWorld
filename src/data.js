const classNames = [
  '10A Math',
  '10B Physics',
  '11A Chemistry',
  '11B Biology',
  '12A Literature',
  '12B History',
];

const schoolNames = [
  'North Academy',
  'River School',
  'Orion Lyceum',
  'Forest Gymnasium',
  'Harbor School',
  'Summit Academy',
];

export function generateSchoolData({
  schoolCount = 3,
  classCount = 12,
  minStudents = 11,
  maxStudents = 18,
} = {}) {
  const schools = Array.from({ length: schoolCount }, (_, index) => ({
    id: `school-${index + 1}`,
    name: schoolNames[index] ?? `School ${index + 1}`,
    index,
    classIds: [],
  }));
  const classes = [];
  const students = [];
  let studentNumber = 1;

  for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
    const school = schools[classIndex % schools.length];
    const indexInSchool = school.classIds.length;
    const id = `class-${classIndex + 1}`;
    const name = classNames[classIndex] ?? `Class ${classIndex + 1}`;
    const studentCount = Math.floor(Math.random() * (maxStudents - minStudents + 1)) + minStudents;
    const classEntity = {
      id,
      parentId: school.id,
      name,
      index: classIndex,
      indexInSchool,
      studentCount,
      studentIds: [],
    };

    school.classIds.push(id);
    classes.push(classEntity);

    for (let studentIndex = 0; studentIndex < studentCount; studentIndex += 1) {
      const student = {
        id: `student-${studentNumber}`,
        parentId: id,
        name: `Student ${studentIndex + 1}`,
        classId: id,
        className: name,
        classIndex,
        schoolId: school.id,
        schoolName: school.name,
        schoolIndex: school.index,
        mark: 40 + ((studentNumber * 37 + classIndex * 17) % 61),
      };
      studentNumber += 1;
      classEntity.studentIds.push(student.id);
      students.push(student);
    }
  }

  return { schools, classes, students };
}
