import * as React from 'react';
import {
  reducer,
  initialState,
} from '@odf/core/components/create-storage-system/reducer';
import { KMSConfigure } from '@odf/core/components/kms-config/kms-config';
import {
  isLengthUnity,
  createCsiKmsResources,
} from '@odf/core/components/kms-config/utils';
import {
  OCS_INTERNAL_CR_NAME,
  OCS_EXTERNAL_CR_NAME,
  KMS_PROVIDER,
  KMSConfigMapCSIName,
  SupportedProviders,
  DescriptionKey,
} from '@odf/core/constants';
import { OCS_INDEPENDENT_FLAG, FEATURES } from '@odf/core/features';
import {
  cephBlockPoolResource,
  cephClusterResource,
} from '@odf/core/resources';
import {
  ProviderNames,
  KmsCsiConfigKeysMapping,
  KMSConfigMap,
} from '@odf/core/types';
import { CEPH_STORAGE_NAMESPACE } from '@odf/shared/constants';
import { ButtonBar } from '@odf/shared/generic/ButtonBar';
import { StatusBox } from '@odf/shared/generic/status-box';
import { useDeepCompareMemoize } from '@odf/shared/hooks/deep-compare-memoize';
import { useK8sGet } from '@odf/shared/hooks/k8s-get-hook';
import {
  ConfigMapModel,
  InfrastructureModel,
  StorageClassModel,
  SecretModel,
} from '@odf/shared/models';
import {
  CephClusterKind,
  ConfigMapKind,
  K8sResourceKind,
  StorageClassResourceKind,
  SecretKind,
} from '@odf/shared/types';
import { useCustomTranslation } from '@odf/shared/useCustomTranslationHook';
import { getInfrastructurePlatform } from '@odf/shared/utils';
import {
  WatchK8sResource,
  ProvisionerProps,
  useFlag,
  useK8sWatchResource,
  useModal,
} from '@openshift-console/dynamic-plugin-sdk';
import * as _ from 'lodash-es';
import {
  Alert,
  Dropdown,
  DropdownItem,
  DropdownToggle,
  DropdownSeparator,
  FormGroup,
  Checkbox,
  Card,
  Button,
  Form,
  Radio,
  ActionGroup,
} from '@patternfly/react-core';
import { CaretDownIcon } from '@patternfly/react-icons';
import {
  CEPH_EXTERNAL_CR_NAME,
  CEPH_INTERNAL_CR_NAME,
  CLUSTER_STATUS,
  POOL_STATE,
} from '../constants';
import { CreateBlockPoolModal } from '../modals/block-pool/create-block-pool-modal';
import { StoragePoolKind } from '../types';
import './sc-form.scss';

type OnParamChange = (id: string, paramName: string, checkbox: boolean) => void;

export const CephFsNameComponent: React.FC<ProvisionerProps> = ({
  parameterKey,
  parameterValue,
  onParamChange,
}) => {
  const { t } = useCustomTranslation();
  const onParamChangeRef = React.useRef<OnParamChange>();
  onParamChangeRef.current = onParamChange;

  const isExternal = useFlag(OCS_INDEPENDENT_FLAG);
  const scName = `${
    isExternal ? OCS_EXTERNAL_CR_NAME : OCS_INTERNAL_CR_NAME
  }-cephfs`;
  const [sc, scLoaded, scLoadError] = useK8sGet<StorageClassResourceKind>(
    StorageClassModel,
    scName
  );

  React.useEffect(() => {
    if (scLoaded && !scLoadError) {
      const fsName = sc?.parameters?.fsName;
      if (fsName) {
        onParamChangeRef.current(parameterKey, fsName, false);
      }
    }
  }, [sc, scLoaded, scLoadError, parameterKey]);

  if (scLoaded && !scLoadError) {
    return (
      <div className="form-group">
        <label htmlFor="filesystem-name" className="co-required">
          {t('Filesystem name')}
        </label>
        <input
          className="pf-c-form-control"
          type="text"
          value={parameterValue}
          disabled={!isExternal}
          onChange={(e) =>
            onParamChange(parameterKey, e.currentTarget.value, false)
          }
          placeholder={t('Enter filesystem name')}
          id="filesystem-name"
          required
        />
        <span className="help-block">
          {t('CephFS filesystem name into which the volume shall be created')}
        </span>
      </div>
    );
  }
  return <StatusBox loadError={scLoadError} loaded={scLoaded} />;
};

export const PoolResourceComponent: React.FC<ProvisionerProps> = ({
  parameterKey,
  onParamChange,
}) => {
  const { t } = useCustomTranslation();

  const launchModal = useModal();

  const [poolData, poolDataLoaded, poolDataLoadError] = useK8sWatchResource<
    StoragePoolKind[]
  >(cephBlockPoolResource);

  const [cephClusters, cephClusterLoaded, cephClusterLoadError] =
    useK8sWatchResource<CephClusterKind[]>(cephClusterResource);

  const [isOpen, setOpen] = React.useState(false);
  const [poolName, setPoolName] = React.useState('');

  const handleDropdownChange = (e: React.KeyboardEvent<HTMLInputElement>) => {
    setPoolName(e.currentTarget.id);
    onParamChange(parameterKey, e.currentTarget.id, false);
  };

  const onPoolCreation = (name: string) => {
    setPoolName(name);
    onParamChange(parameterKey, name, false);
  };

  const onPoolInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPoolName(e.currentTarget.value);
    onParamChange(parameterKey, e.currentTarget.value, false);
  };

  const poolDropdownItems = _.reduce(
    poolData,
    (res, pool: StoragePoolKind) => {
      const compressionText =
        pool?.spec?.compressionMode === 'none' ||
        pool?.spec?.compressionMode === ''
          ? t('no compression')
          : t('with compression');
      if (
        pool?.status?.phase === POOL_STATE.READY &&
        cephClusters[0]?.status?.phase === CLUSTER_STATUS.READY
      ) {
        res.push(
          <DropdownItem
            key={pool.metadata.uid}
            component="button"
            id={pool?.metadata?.name}
            data-test={pool?.metadata?.name}
            onClick={handleDropdownChange}
            description={t('Replica {{poolSize}} {{compressionText}}', {
              poolSize: pool?.spec?.replicated?.size,
              compressionText,
            })}
          >
            {pool?.metadata?.name}
          </DropdownItem>
        );
      }
      return res;
    },
    [
      <DropdownItem
        data-test="create-new-pool-button"
        key="first-item"
        component="button"
        onClick={() =>
          launchModal(CreateBlockPoolModal, {
            cephClusters,
            onPoolCreation,
          })
        }
      >
        {t('Create New Pool')}
      </DropdownItem>,
      <DropdownSeparator key="separator" />,
    ]
  );

  if (cephClusters[0]?.metadata.name === CEPH_INTERNAL_CR_NAME) {
    return (
      <>
        {!poolDataLoadError && cephClusters && (
          <div className="form-group">
            <label className="co-required" htmlFor="ocs-storage-pool">
              {t('Storage Pool')}
            </label>
            <Dropdown
              className="dropdown--full-width"
              toggle={
                <DropdownToggle
                  id="pool-dropdown-id"
                  data-test="pool-dropdown-toggle"
                  onToggle={() => setOpen(!isOpen)}
                  toggleIndicator={CaretDownIcon}
                >
                  {poolName || t('Select a Pool')}
                </DropdownToggle>
              }
              isOpen={isOpen}
              dropdownItems={poolDropdownItems}
              onSelect={() => setOpen(false)}
              id="ocs-storage-pool"
            />
            <span className="help-block">
              {t('Storage pool into which volume data shall be stored')}
            </span>
          </div>
        )}
        {(poolDataLoadError || cephClusterLoadError) && (
          <Alert
            className="co-alert"
            variant="danger"
            title={t('Error retrieving Parameters')}
            isInline
          />
        )}
      </>
    );
  }
  if (cephClusters[0]?.metadata.name === CEPH_EXTERNAL_CR_NAME) {
    return (
      <div className="form-group">
        <label className="co-required" htmlFor="ocs-storage-pool">
          {t('Storage Pool')}
        </label>
        <input
          className="pf-c-form-control"
          type="text"
          onChange={onPoolInput}
          placeholder={t('my-storage-pool')}
          aria-describedby={t('pool-name-help')}
          id="pool-name"
          name="newPoolName"
          required
        />
        <span className="help-block">
          {t('Storage pool into which volume data shall be stored')}
        </span>
      </div>
    );
  }
  return (
    <StatusBox
      loadError={cephClusterLoadError && poolDataLoadError}
      loaded={cephClusterLoaded && poolDataLoaded}
    />
  );
};

const StorageClassEncryptionLabel: React.FC = () => {
  const { t } = useCustomTranslation();

  return (
    <div className="ocs-storage-class-encryption__pv-title">
      <span className="ocs-storage-class-encryption__pv-title--padding">
        {t('Enable Encryption')}
      </span>
    </div>
  );
};

export const StorageClassEncryption: React.FC<ProvisionerProps> = ({
  parameterKey,
  onParamChange,
}) => {
  const { t } = useCustomTranslation();

  const isKmsSupported = useFlag(FEATURES.OCS_KMS);
  const [checked, isChecked] = React.useState(false);

  const setChecked = (value: boolean) => {
    onParamChange(parameterKey, value.toString(), false);
    isChecked(value);
  };

  return (
    isKmsSupported && (
      <div className="ocs-storage-class__form">
        <Form>
          <FormGroup
            fieldId="storage-class-encryption"
            helperTextInvalid={t('This is a required field')}
            isRequired
          >
            <Checkbox
              id="storage-class-encryption"
              isChecked={checked}
              data-checked-state={checked}
              label={<StorageClassEncryptionLabel />}
              aria-label={t('StorageClass encryption')}
              onChange={setChecked}
              className="ocs-storage-class-encryption__form-checkbox"
              data-test="storage-class-encryption"
            />
            <span className="help-block">
              {t(
                'An encryption key will be generated for each PersistentVolume created using this StorageClass.'
              )}
            </span>
          </FormGroup>
        </Form>
      </div>
    )
  );
};

const ExistingKMSDropDown: React.FC<ExistingKMSDropDownProps> = ({
  csiConfigMap,
  serviceName,
  kmsProvider,
  infraType,
  secrets,
  setEncryptionId,
}) => {
  const { t } = useCustomTranslation();
  const isHpcsKmsSupported = useFlag(FEATURES.ODF_HPCS_KMS);

  const [isProviderOpen, setProviderOpen] = React.useState(false);
  const [isServiceOpen, setServiceOpen] = React.useState(false);
  const [provider, setProvider] = React.useState<string>(kmsProvider);
  const [kmsServiceDropdownItems, setKmsServiceDropdownItems] = React.useState<
    JSX.Element[]
  >([]);

  const handleProviderDropdownChange = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    setProvider(e.currentTarget.id);
    setEncryptionId('');
  };

  const kmsProviderDropdownItems = _.reduce(
    SupportedProviders,
    (res, providerDetails, providerName) => {
      if (
        !SupportedProviders[providerName].allowedPlatforms ||
        SupportedProviders[providerName]?.allowedPlatforms.includes(infraType)
      )
        res.push(
          <DropdownItem
            key={providerDetails.group}
            component="button"
            id={providerName}
            data-test={providerDetails.group}
            onClick={handleProviderDropdownChange}
          >
            {providerDetails.group}
          </DropdownItem>
        );
      return res;
    },
    []
  );

  React.useEffect(() => {
    const handleServiceDropdownChange = (
      e: React.KeyboardEvent<HTMLInputElement>
    ) => setEncryptionId(e.currentTarget.id);
    setKmsServiceDropdownItems(
      _.reduce(
        csiConfigMap?.data,
        (res, connectionDetails, connectionName) => {
          try {
            // removing any object having syntax error
            // or, which are not supported by UI.
            const kmsData: KMSConfigMap = JSON.parse(connectionDetails);

            // Todo: will remove this once we we completly moved to camelcase
            const kmsProviderName =
              kmsData?.[KMS_PROVIDER] ??
              kmsData?.[KmsCsiConfigKeysMapping[KMS_PROVIDER]];
            const kmsDescriptionKey = DescriptionKey[kmsProviderName];
            const filterFunction = SupportedProviders[provider]?.filter;

            if (
              SupportedProviders[provider].supported.includes(
                kmsProviderName
              ) &&
              (!filterFunction || !filterFunction(kmsData, secrets))
            ) {
              res.push(
                <DropdownItem
                  key={connectionName}
                  component="button"
                  id={connectionName}
                  data-test={connectionName}
                  onClick={handleServiceDropdownChange}
                  description={
                    kmsData?.[kmsDescriptionKey] ??
                    kmsData?.[KmsCsiConfigKeysMapping[kmsDescriptionKey]]
                  }
                >
                  {connectionName}
                </DropdownItem>
              );
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
          }
          return res;
        },
        []
      )
    );
  }, [provider, csiConfigMap, secrets, setEncryptionId]);

  return (
    <div className="ocs-storage-class-encryption__form-dropdown--padding">
      <div className="form-group">
        <label htmlFor="kms-provider">{t('Provider')}</label>
        <Dropdown
          className="dropdown dropdown--full-width"
          toggle={
            <DropdownToggle
              id="kms-provider-dropdown-id"
              data-test="kms-provider-dropdown-toggle"
              onToggle={() => setProviderOpen(!isProviderOpen)}
              toggleIndicator={CaretDownIcon}
              isDisabled={
                !isHpcsKmsSupported || isLengthUnity(kmsProviderDropdownItems)
              }
            >
              {SupportedProviders[provider].group}
            </DropdownToggle>
          }
          isOpen={isProviderOpen}
          dropdownItems={kmsProviderDropdownItems}
          onSelect={() => setProviderOpen(false)}
          id="kms-provider"
          data-test="kms-provider-dropdown"
        />
      </div>
      <div className="form-group">
        <label htmlFor="kms-service">{t('Key service')}</label>
        <Dropdown
          className="dropdown dropdown--full-width"
          toggle={
            <DropdownToggle
              id="kms-service-dropdown-id"
              data-test="kms-service-dropdown-toggle"
              onToggle={() => setServiceOpen(!isServiceOpen)}
              toggleIndicator={CaretDownIcon}
            >
              {serviceName || t('Select an existing connection')}
            </DropdownToggle>
          }
          isOpen={isServiceOpen}
          dropdownItems={kmsServiceDropdownItems}
          onSelect={() => setServiceOpen(false)}
          id="kms-service"
          data-test="kms-service-dropdown"
        />
      </div>
    </div>
  );
};

const csiCMWatchResource: WatchK8sResource = {
  kind: ConfigMapModel.kind,
  namespaced: true,
  isList: false,
  namespace: CEPH_STORAGE_NAMESPACE,
  name: KMSConfigMapCSIName,
};

const secretResource: WatchK8sResource = {
  isList: true,
  kind: SecretModel.kind,
  namespace: CEPH_STORAGE_NAMESPACE,
};

export const StorageClassEncryptionKMSID: React.FC<ProvisionerProps> = ({
  parameterKey,
  onParamChange,
}) => {
  const { t } = useCustomTranslation();
  const onParamChangeRef = React.useRef<OnParamChange>();
  onParamChangeRef.current = onParamChange;

  const [state, dispatch] = React.useReducer(reducer, initialState);
  const [isExistingKms, setIsExistingKms] = React.useState<boolean>(true);
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [progress, setInProgress] = React.useState<boolean>(false);
  const [serviceName, setServiceName] = React.useState<string>('');

  const { kms, encryption } = state.securityAndNetwork;
  const { provider } = kms;

  if (!encryption.storageClass) {
    dispatch({
      type: 'securityAndNetwork/setEncryption',
      payload: {
        ...encryption,
        storageClass: true,
      },
    });
  }

  const [infra, infraLoaded, infraLoadError] = useK8sGet<any>(
    InfrastructureModel,
    'cluster'
  );
  const [csiConfigMap, csiConfigMapLoaded, csiConfigMapLoadError] =
    useK8sWatchResource<ConfigMapKind>(csiCMWatchResource);
  const [secrets, secretsLoaded, secretsLoadError] =
    useK8sWatchResource<SecretKind[]>(secretResource);

  const infraType = getInfrastructurePlatform(infra);
  const memoizedCsiConfigMap = useDeepCompareMemoize(csiConfigMap, true);

  const setEncryptionId = React.useCallback(
    (encryptionId: string) => {
      setServiceName(encryptionId);
      onParamChangeRef.current(parameterKey, encryptionId, false);
    },
    [parameterKey]
  );

  // ToDo (Sanjal): "StorageClassForm" got refactored to a FC (https://github.com/openshift/console/pull/13036).
  // If any "parameter" specific "Component" in un-mounting, it do not have access to latest "onParamChange" (having latest "newStorageClass" object).
  // Talk to OCP team, maybe we can pass "onParamChange" as a "useRef" object, which can resolve this issue.

  // When user selects a connection from the dropdown, but, then un-checks the encryption checkbox,
  // and checks it back again. Component will be re-mounted, still Redux state will still
  // have previously selected parameterValue. This useEffect is to clean that up.
  /* React.useEffect(() => {
    return () => setEncryptionId('');
  }, [setEncryptionId]); */

  /** When csiConfigMap is deleted from another tab, "csiConfigMapLoadError" == true (404 Not Found), but,
   * "csiConfigMap" still contains same old object that was present before the deletion of the configMap.
   * Hence, dropdown was not updating dynamically. Used csiKmsDetails to handle that.
   */
  const [csiKmsDetails, setCsiKmsDetails] = React.useState<ConfigMapKind>(null);
  React.useEffect(() => {
    if (csiConfigMapLoaded && !csiConfigMapLoadError && memoizedCsiConfigMap) {
      setCsiKmsDetails(memoizedCsiConfigMap);
    } else if (csiConfigMapLoadError) {
      setIsExistingKms(false);
      setCsiKmsDetails(null);
      setEncryptionId('');
    }
  }, [
    memoizedCsiConfigMap,
    csiConfigMapLoaded,
    csiConfigMapLoadError,
    setIsExistingKms,
    setEncryptionId,
  ]);

  const updateKMS = async () => {
    setInProgress(true);
    const allServiceNames = csiKmsDetails
      ? Object.keys(csiKmsDetails?.data)
      : [];
    if (
      (allServiceNames.length &&
        allServiceNames.indexOf(kms.providerState.name.value) === -1) ||
      !csiKmsDetails
    ) {
      try {
        const promises: Promise<K8sResourceKind>[] = createCsiKmsResources(
          kms.providerState,
          !!csiKmsDetails,
          provider
        );
        await Promise.all(promises).then(() => {
          setIsExistingKms(true);
          setEncryptionId(kms.providerState.name.value);
        });
        setErrorMessage('');
      } catch (error) {
        setErrorMessage(error.message);
      }
    } else {
      setErrorMessage(
        t('KMS service {{value}} already exist', {
          value: kms.providerState.name.value,
        })
      );
    }
    setInProgress(false);
  };

  if (
    (!csiConfigMapLoaded && !csiConfigMapLoadError) ||
    !infraLoaded ||
    infraLoadError ||
    !secretsLoaded ||
    secretsLoadError
  ) {
    return (
      <StatusBox
        loadError={infraLoadError || csiConfigMapLoadError || secretsLoadError}
        loaded={infraLoaded && csiConfigMapLoaded && secretsLoaded}
      />
    );
  }
  return (
    <Form className="ocs-storage-class-encryption__form--padding">
      <FormGroup fieldId="rbd-sc-kms-connection-selector">
        <div id="rbd-sc-kms-connection-selector">
          <Radio
            label={t('Choose existing KMS connection')}
            name="kms-selection"
            id="choose-existing-kms-connection"
            className="ocs-storage-class-encryption__form-radio"
            onClick={() => setIsExistingKms(true)}
            checked={isExistingKms}
          />
          {isExistingKms && (
            <ExistingKMSDropDown
              csiConfigMap={csiKmsDetails}
              serviceName={serviceName}
              kmsProvider={provider}
              infraType={infraType}
              secrets={secrets}
              setEncryptionId={setEncryptionId}
            />
          )}
          <Radio
            label={t('Create new KMS connection')}
            name="kms-selection"
            id="create-new-kms-connection"
            className="ocs-storage-class-encryption__form-radio"
            onClick={() => setIsExistingKms(false)}
            checked={!isExistingKms}
            data-test={`sc-form-new-kms-radio`}
          />
          {!isExistingKms && (
            <Card isFlat className="ocs-storage-class-encryption__card">
              <KMSConfigure
                state={state.securityAndNetwork}
                dispatch={dispatch}
                infraType={infraType}
                className="ocs-storage-class-encryption"
              />
              <div className="ocs-install-kms__save-button">
                <ButtonBar errorMessage={errorMessage} inProgress={progress}>
                  <ActionGroup>
                    <Button
                      variant="secondary"
                      onClick={updateKMS}
                      isDisabled={!kms.providerState.hasHandled}
                      data-test="save-action"
                    >
                      {t('Save')}
                    </Button>
                  </ActionGroup>
                </ButtonBar>
              </div>
            </Card>
          )}
        </div>
      </FormGroup>
    </Form>
  );
};

type ExistingKMSDropDownProps = {
  csiConfigMap: ConfigMapKind;
  serviceName: string;
  kmsProvider: ProviderNames;
  infraType: string;
  secrets: SecretKind[];
  setEncryptionId: (encryptionId: string) => void;
};
