library OralCancerLabelImage version '1.0.0'

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1'

codesystem "RoleType": 'https://midas.iisc.ac.in/fhir/CodeSystem/practitioner-role-type'
code "OralCancerReader": 'reader' from "RoleType" display 'Reader'

// Reader
define "All Active Reader" : [Practitioner] P
    with [PractitionerRole: code in "OralCancerReader"] PR
        such that PR.practitioner is not null
        and P.active is true
        and P.id.value =  Split(PR.practitioner.reference,'/')[1]

define "All Active Reader with Task Count": "All Active Reader" P
    return Tuple {
        practitioner: P,
        taskCount: Count([Task] T where T.status = 'requested' and T.owner is not null and P.id.value =  Split(T.owner.reference,'/')[1])
    }
    sort by taskCount asc

define "Available Reader": First("All Active Reader with Task Count").practitioner

define "Available Reader Reference": if "Available Reader" is not null
    then Reference {
                 reference : string {
                     value: ReplaceMatches('Practitioner/'+ "Available Reader".id,'#','')
                 }
             }
    else null

define "Image Labelling Questionnaire": Reference { reference : string {value: 'Questionnaire/OralCancerImageLabel'}}