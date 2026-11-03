import { Controller, Get } from '@nestjs/common';

@Controller('sites')
export class SiteController {
  @Get()
  list() {
    return {
      type: 'sitesConfig',
      environments: [
        {
          type: 'staging',
          site: {
            code: 'staging',
            name: 'Staging',
            fhirBaseUrl: 'https://staging.arogyam-midas.iisc.ac.in/fhir/',
            authBaseUrl:
              'https://staging.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
            authClientId: 'arogyam-app',
            oauthClientId: 'profile',
            mapSdkToken: 'MAPBOX_SDK_TOKEN',
            openSrpAppId: 'app',
            sentryDsn: '',
          },
        },
      ],
      sites: [
        {
          code: '1',
          name: "KLE Society's Institute of Dental Sciences, Bangalore",
          fhirBaseUrl:
            'https://site-1-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-1-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '2',
          name: 'AIIMS, Delhi and NCI, Jhajjar',
          fhirBaseUrl:
            'https://site-2-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-2-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '3',
          name: 'MSMF and MSMC, Narayana Hrudayalaya Health City, Bangalore',
          fhirBaseUrl:
            'https://site-3-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-3-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '4',
          name: 'Public health facilities, Krishnagiri',
          fhirBaseUrl:
            'https://site-4-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-4-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '5',
          name: 'Public health facilities, Thanjavur',
          fhirBaseUrl:
            'https://site-5-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-5-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '6',
          name: 'MPMMCC, Varanasi',
          fhirBaseUrl:
            'https://site-6-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-6-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '7',
          name: 'Cachar Cancer Hospital and Research Centre, Silchar',
          fhirBaseUrl:
            'https://site-7-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-7-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '8',
          name: 'Dr.Bhubaneswar Borooah Cancer Institute, Guwahati',
          fhirBaseUrl:
            'https://site-8-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-8-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: '9',
          name: 'Public health facilities, Goa',
          fhirBaseUrl:
            'https://site-9-production.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://site-9-production.arogyam-midas.iisc.ac.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: 'test',
          name: 'Demo',
          fhirBaseUrl: 'https://test-aicoe.midashealth.in/fhir/',
          authBaseUrl: 'https://test-aicoe.midashealth.in/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: 'dummy-staging',
          name: 'Dummy Staging',
          fhirBaseUrl: 'https://dummy-staging.arogyam-midas.iisc.ac.in/fhir/',
          authBaseUrl:
            'https://dummy-staging.arogyam-midas.iisc.ac.in/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: '',
        },
        {
          code: 'stg',
          name: "Aarogya Aarohan STG",
          fhirBaseUrl: 'https://stg.arogyam.artpark.ai/fhir/',
          authBaseUrl: 'https://stg.arogyam.artpark.ai/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: ''
        },
        {
          code: 'stg-tanuh',
          name: "Aarogya Aarohan STG - tanuh",
          fhirBaseUrl: 'https://stg.aarogya-aarohan.tanuh.ai/fhir/',
          authBaseUrl: 'https://stg.aarogya-aarohan.tanuh.ai/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: ''
        },
        {
          code: 'wb',
          name: "Public health facilities, West Bengal",
          fhirBaseUrl: 'https://wb.aarogya-aarohan.tanuh.ai/fhir/',
          authBaseUrl: 'https://wb.aarogya-aarohan.tanuh.ai/auth/realms/arogyam/',
          authClientId: 'arogyam-app',
          oauthClientId: 'profile',
          mapSdkToken: 'MAPBOX_SDK_TOKEN',
          openSrpAppId: 'app',
          sentryDsn: ''
        }
      ],
    };
  }
}
