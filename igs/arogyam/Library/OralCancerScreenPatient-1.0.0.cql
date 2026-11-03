library OralCancerScreenPatient version '1.0.0'

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1'

codesystem "RoleType": 'https://midas.iisc.ac.in/fhir/CodeSystem/practitioner-role-type'
code "OralCancerSpecialist": 'specialist' from "RoleType" display 'Oral Cancer Specialist'
code "OralCancerSeniorSpecialist": 'senior-specialist' from "RoleType" display 'Oral Cancer Senior Specialist'


// Specialist
define "All Active Specialist" : [Practitioner] P
    with [PractitionerRole: code in "OralCancerSpecialist"] PR
        such that PR.practitioner is not null
        and P.active is true
        and P.id.value =  Split(PR.practitioner.reference,'/')[1]

define "All Active Specialist with Task Count": "All Active Specialist" P
    return Tuple {
        practitioner: P,
        taskCount: Count([Task] T where T.status = 'requested' and T.owner is not null and P.id.value =  Split(T.owner.reference,'/')[1])
    }
    sort by taskCount asc

define "Available Specialist": First("All Active Specialist with Task Count").practitioner

define "Available Specialist Reference": if "Available Specialist" is not null
    then Reference {
                 reference : string {
                     value: ReplaceMatches('Practitioner/'+ "Available Specialist".id,'#','')
                 }
             }
    else null

define "Patient Screening Questionnaire": Reference { reference : string {value: 'Questionnaire/OralCancerScreenPatient'}}


// Senior Specialist
define "All Active Senior Specialist" : [Practitioner] P
    with [PractitionerRole: code in "OralCancerSeniorSpecialist"] PR
        such that PR.practitioner is not null
        and P.active is true
        and P.id.value =  Split(PR.practitioner.reference,'/')[1]

define "All Active Senior Specialist with Task Count": "All Active Senior Specialist" P
    return Tuple {
        practitioner: P,
        taskCount: Count([Task] T where T.status = 'requested' and T.owner is not null and P.id.value =  Split(T.owner.reference,'/')[1])
    }
    sort by taskCount asc

define "Available Senior Specialist": First("All Active Senior Specialist with Task Count").practitioner

define "Available Senior Specialist Reference": if "Available Senior Specialist" is not null
    then Reference {
                 reference : string {
                     value: ReplaceMatches('Practitioner/'+ "Available Senior Specialist".id,'#','')
                 }
             }
    else null