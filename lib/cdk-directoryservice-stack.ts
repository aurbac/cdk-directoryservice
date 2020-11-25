import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as direcotryservice from '@aws-cdk/aws-directoryservice';
import * as ssm from '@aws-cdk/aws-ssm';
import * as iam from '@aws-cdk/aws-iam';

interface CdkDirectoryserviceStackProps extends cdk.StackProps{
  directoryServiceName: string;
  directoryServiceShortName: string;
  directoryServicePasswordSecret: string;
}

export class CdkDirectoryserviceStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: CdkDirectoryserviceStackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.1.0.0/16",
      subnetConfiguration: [
        {  cidrMask: 22, subnetType: ec2.SubnetType.PUBLIC, name: "Public" },
        {  cidrMask: 22, subnetType: ec2.SubnetType.PRIVATE, name: "Private" }
        ],
      maxAzs: 2
    });
    
    const directoryServicePassword = cdk.SecretValue.secretsManager(props.directoryServicePasswordSecret);
    
    const ds = new direcotryservice.CfnMicrosoftAD(this, "directoryservice", { 
      vpcSettings: {
        'vpcId': vpc.vpcId,
        'subnetIds': vpc.privateSubnets.map(function(subnet) {
            return subnet.subnetId;
          }),
      }, 
      name: props.directoryServiceName, 
      password: directoryServicePassword.toString(),
      edition: 'Enterprise',
      shortName: props.directoryServiceShortName,
      enableSso: true, 
      createAlias: true
    });
    
    const windows = ec2.MachineImage.latestWindows(ec2.WindowsVersion.WINDOWS_SERVER_2019_ENGLISH_FULL_BASE);

    const role = new iam.Role(this, 'windows_role', { 
      managedPolicies: [ { managedPolicyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM"  } ], 
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com')
    });

    const profile = new iam.CfnInstanceProfile(this, "windows_profile", {
      roles: [ role.roleName  ]
    });

    const mySecurityGroup = new ec2.SecurityGroup(this, 'windows_security_group', {
      vpc,
      description: 'Allow rdp access to ec2 instances',
      allowAllOutbound: true   // Can be set to false
    });
    mySecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3389), 'allow rdp access from the world');
    
    const document = new ssm.CfnDocument(this, "windows_document_ad", { content: {
        "description": "Join instances to an AWS Directory Service domain.",
        "parameters": {
                        "directoryId": {
                            "description": "(Required) The ID of the AWS Directory Service directory.",
                            "type": "String"
                        },
                        "directoryName": {
                            "description": "(Required) The name of the directory; for example, test.example.com",
                            "type": "String"
                        },
                        "dnsIpAddresses": {
                            "allowedPattern": "((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)",
                            "default": [],
                            "description": "(Optional) The IP addresses of the DNS servers in the directory. Required when DHCP is not configured. Learn more at http://docs.aws.amazon.com/directoryservice/latest/simple-ad/join_get_dns_addresses.html",
                            "type": "StringList"
                        }
                    },
          "runtimeConfig": {
                        "aws:domainJoin": {
                            "properties": {
                                "directoryId": "{{ directoryId }}",
                                "directoryName": "{{ directoryName }}",
                                "dnsIpAddresses": "{{ dnsIpAddresses }}"
                            }
                        }
                    },
          "schemaVersion": "1.2"
      }
    });
    
    const instance = new ec2.CfnInstance(this, "windows", { 
      imageId: windows.getImage(this).imageId,
      instanceType: 't3.large', 
      subnetId: vpc.selectSubnets({subnetType: ec2.SubnetType.PUBLIC}).subnets[0].subnetId,
      securityGroupIds: [mySecurityGroup.securityGroupId],
      iamInstanceProfile: profile.ref,
      tags: [ { key: 'Name', value: 'WindowsToManageAD' } ],
      ssmAssociations: [
        { 
          documentName: document.ref, 
          associationParameters: [
            { key: "directoryId", value: [ds.ref] }, 
            { key: "directoryName", value: [props.directoryServiceName] },   
            { key: "dnsIpAddresses", value: ds.attrDnsIpAddresses }
          ]
        }
      ]
    });
    
  }
}
